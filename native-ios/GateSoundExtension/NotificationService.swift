import AVFoundation
import CryptoKit
import UserNotifications

/// Gate alerts on a locked iPhone or iPad, in the school's voice (docs/architecture/ios-app.md).
///
/// iOS lets a notification service extension change an alert before it is shown; it may not play audio or run speech.
/// So this extension downloads the alert's recordings (the very clips the duty screen plays, linked by push-send for
/// this alert only), puts the duty screen's chime before them, and saves the result as the alert's custom sound: Linear
/// PCM in a CAF file under 30 seconds, in Library/Sounds of the app group, where UNNotificationSound looks for it.
/// Anything that fails or runs out of time leaves the alert with the standard sound, so an alert is never lost.
///
/// NOT YET BUILT OR RUN: written without Xcode (no Mac or Apple Developer membership yet). Build and test it on a device
/// before relying on it; see the checklist in docs/architecture/ios-app.md.
final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var handler: ((UNNotificationContent) -> Void)?
    private var content: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        lock.lock()
        handler = contentHandler
        self.content = content
        lock.unlock()
        // FCM puts the message's data keys at the top level of the APNs payload (push.ts fcmMessageFor).
        let info = request.content.userInfo
        guard let clips = GateSound.clips(from: info["clips"] as? String) else { return deliver() }
        let flagged = (info["chime"] as? String) == "flagged"
        DispatchQueue.global(qos: .userInitiated).async {
            self.deliver(sound: GateSound.make(clips, flagged: flagged))
        }
    }

    /// About 30 seconds have passed: the alert goes out now, with the standard sound.
    override func serviceExtensionTimeWillExpire() { deliver() }

    /// Hands the alert to iOS exactly once: with the school's sound when it is ready, else as it came.
    private func deliver(sound: String? = nil) {
        lock.lock()
        let h = handler, c = content
        handler = nil
        lock.unlock()
        guard let h, let c else { return }
        if let sound { c.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: sound)) }
        h(c)
    }
}

struct Clip: Decodable { let key: String; let url: String }

enum GateSound {
    /// Shared with the app target (both need the App Groups capability with this id).
    static let appGroup = "group.in.jumpstartpreschool.go"
    static let rate = 24_000.0
    // The duty screen's chime (src/features/duty/sound.ts) and the pause between recordings.
    static let normal: [Double] = [659.3, 987.8]
    static let flaggedNotes: [Double] = [784, 988, 1175]
    static let partGap = 0.15
    // Apple plays the standard sound instead of a custom one of 30 seconds or more.
    static let maxSeconds = 29.0
    static let keep = 40

    /// The alert's recordings, or nil unless every one has a hash key and an https link (all or none, as on Android).
    static func clips(from json: String?) -> [Clip]? {
        guard let data = json?.data(using: .utf8), let list = try? JSONDecoder().decode([Clip].self, from: data), !list.isEmpty,
              list.allSatisfy({ $0.key.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil && $0.url.hasPrefix("https://") })
        else { return nil }
        return list
    }

    /// The sound file's name in Library/Sounds, made once per set of recordings and chime, or nil when it can't be made.
    static func make(_ clips: [Clip], flagged: Bool) -> String? {
        let fm = FileManager.default
        guard let group = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let dir = group.appendingPathComponent("Library/Sounds", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let id = SHA256.hash(data: Data((clips.map(\.key).joined(separator: ",") + (flagged ? "+urgent" : "")).utf8))
            .map { String(format: "%02x", $0) }.joined()
        let name = "gate-\(id.prefix(32)).caf"
        let out = dir.appendingPathComponent(name)
        if fm.fileExists(atPath: out.path) { return name }
        // Its own folder: alerts arriving together are built at the same time and share the opening recording. The sound
        // is written there first, under a name still ending in .caf (AVAudioFile takes the file type from it), so a run
        // cut short never leaves a broken sound behind under the real name.
        let work = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let part = work.appendingPathComponent(name)
        defer { try? fm.removeItem(at: work) }
        do {
            try fm.createDirectory(at: work, withIntermediateDirectories: true)
            let files = try clips.map { try download($0, into: work) }
            try write(chime: flagged ? flaggedNotes : normal, clips: files, to: part)
            // Another alert with the same recordings may have made it meanwhile.
            do { try fm.moveItem(at: part, to: out) } catch { guard fm.fileExists(atPath: out.path) else { throw error } }
            trim(dir)
            return name
        } catch {
            return nil
        }
    }

    private final class Box: @unchecked Sendable { var result: Result<URL, Error> = .failure(URLError(.timedOut)) }

    static func download(_ clip: Clip, into dir: URL) throws -> URL {
        guard let url = URL(string: clip.url) else { throw URLError(.badURL) }
        let to = dir.appendingPathComponent("\(clip.key).mp3")
        let box = Box()
        let done = DispatchSemaphore(value: 0)
        URLSession.shared.downloadTask(with: URLRequest(url: url, timeoutInterval: 8)) { tmp, response, error in
            defer { done.signal() }
            guard let tmp, (response as? HTTPURLResponse)?.statusCode == 200 else {
                box.result = .failure(error ?? URLError(.badServerResponse))
                return
            }
            do {
                try? FileManager.default.removeItem(at: to)
                try FileManager.default.moveItem(at: tmp, to: to)
                box.result = .success(to)
            } catch {
                box.result = .failure(error)
            }
        }.resume()
        _ = done.wait(timeout: .now() + 10)
        return try box.result.get()
    }

    /// Chime, then each recording with the duty screen's pause between them, as 16-bit Linear PCM at 24 kHz.
    static func write(chime notes: [Double], clips: [URL], to out: URL) throws {
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
        ]
        let file = try AVAudioFile(forWriting: out, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
        let format = file.processingFormat
        let speech = try clips.map { try decode($0, to: format) }
        let frames = speech.reduce(0.0) { $0 + Double($1.frameLength) } + Double(clips.count - 1) * partGap * rate
        guard (chimeSeconds(notes) * rate + frames) / rate < maxSeconds else { throw CocoaError(.fileWriteOutOfSpace) }
        try file.write(from: tone(notes, format: format))
        for (i, buffer) in speech.enumerated() {
            if i > 0 { try file.write(from: silence(partGap, format: format)) }
            try file.write(from: buffer)
        }
    }

    static func decode(_ url: URL, to format: AVAudioFormat) throws -> AVAudioPCMBuffer {
        let input = try AVAudioFile(forReading: url)
        guard let source = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: AVAudioFrameCount(input.length)) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        try input.read(into: source)
        if input.processingFormat == format { return source }
        let ratio = format.sampleRate / input.processingFormat.sampleRate
        guard let converter = AVAudioConverter(from: input.processingFormat, to: format),
              let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(Double(source.frameLength) * ratio) + 4096) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        var given = false
        var failure: NSError?
        converter.convert(to: out, error: &failure) { _, status in
            if given { status.pointee = .endOfStream; return nil }
            given = true
            status.pointee = .haveData
            return source
        }
        if let failure { throw failure }
        return out
    }

    static func chimeSeconds(_ notes: [Double]) -> Double { 0.03 + Double(notes.count - 1) * 0.2 + 0.55 + 0.15 }

    /// Sine notes 0.2 s apart, each rising to 0.4 in 15 ms and falling exponentially over 0.55 s (sound.ts chime()).
    static func tone(_ notes: [Double], format: AVAudioFormat) -> AVAudioPCMBuffer {
        let n = AVAudioFrameCount(chimeSeconds(notes) * format.sampleRate)
        let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: n)!
        buf.frameLength = n
        let out = buf.floatChannelData![0]
        for i in 0..<Int(n) {
            let t = Double(i) / format.sampleRate
            var v = 0.0
            for (k, f) in notes.enumerated() {
                let at = t - 0.03 - Double(k) * 0.2
                guard at >= 0, at <= 0.6 else { continue }
                let gain = at < 0.015 ? 0.0001 * pow(4000, at / 0.015) : at < 0.55 ? 0.4 * pow(0.0001 / 0.4, (at - 0.015) / 0.535) : 0.0001
                v += sin(2 * .pi * f * at) * gain
            }
            out[i] = Float(max(-1, min(1, v)))
        }
        return buf
    }

    static func silence(_ seconds: Double, format: AVAudioFormat) -> AVAudioPCMBuffer {
        let n = AVAudioFrameCount(seconds * format.sampleRate)
        let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: n)!
        buf.frameLength = n
        memset(buf.floatChannelData![0], 0, Int(n) * MemoryLayout<Float>.size)
        return buf
    }

    /// Keeps the newest sounds only; a sound's name covers its recordings, whose keys cover the voice and the words.
    static func trim(_ dir: URL) {
        let fm = FileManager.default
        guard let all = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sounds = all.filter { $0.lastPathComponent.hasPrefix("gate-") && $0.pathExtension == "caf" }
        guard sounds.count > keep else { return }
        let dated = sounds.map { ($0, (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
        for (url, _) in dated.sorted(by: { $0.1 < $1.1 }).prefix(sounds.count - keep) { try? fm.removeItem(at: url) }
    }
}

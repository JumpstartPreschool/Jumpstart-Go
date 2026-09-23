import { Route, Routes } from 'react-router'
import { PreviewIndex } from './PreviewIndex'
import { ParentToday } from './ParentToday'
import { LiveTrip } from './LiveTrip'
import { GateQueue } from './GateQueue'
import { LinkPage } from './LinkPage'

export default function PreviewRoutes() {
  return (
    <Routes>
      <Route index element={<PreviewIndex />} />
      <Route path="parent" element={<ParentToday />} />
      <Route path="trip" element={<LiveTrip />} />
      <Route path="gate" element={<GateQueue />} />
      <Route path="link" element={<LinkPage />} />
    </Routes>
  )
}

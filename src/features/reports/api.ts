import { supabase } from '../../lib/supabase'
import type { ReportData } from './engine'

export interface Filters { from: string; to: string; classId: string | null; programmeId: string | null; childId: string | null }

/** The register for these filters, from attendance_report (0062): admin and Head office only, checked by the server. */
export async function loadReport(f: Filters): Promise<ReportData> {
  const { data, error } = await supabase.rpc('attendance_report', { p_from: f.from, p_to: f.to, p_class: f.classId, p_programme: f.programmeId, p_child: f.childId })
  if (error) throw new Error(error.message.replace(/^[a-z_]+: /, ''))
  return data as ReportData
}

export interface Option { id: string; name: string }
export async function loadOptions(): Promise<{ classes: Option[]; programmes: Option[] }> {
  const [c, p] = await Promise.all([
    supabase.from('classes').select('id, name').order('sort'),
    supabase.from('programmes').select('id, name').eq('active', true).order('name'),
  ])
  if (c.error || p.error) throw new Error("Couldn't load the classes and programmes.")
  return { classes: (c.data ?? []) as Option[], programmes: (p.data ?? []) as Option[] }
}

export interface Changes { status?: 'present' | 'absent' | 'on_leave' | 'off'; dropoff_at?: string | null; pickup_at?: string | null; note?: string | null }
/** An admin's correction: all or nothing, with a reason. `request` makes a retry harmless. */
export async function correctAttendance(childId: string, day: string, changes: Changes, reason: string, request: string): Promise<void> {
  const { error } = await supabase.rpc('correct_attendance', { p_child: childId, p_day: day, p_changes: changes, p_reason: reason, p_request: request })
  if (error) throw new Error(error.message.replace(/^[a-z_]+: /, ''))
}

export type ReportKind = 'executive' | 'register' | 'detailed'
export type Format = 'pdf' | 'xlsx' | 'docx' | 'csv'
/** Logged before any file is made; the server gives the Report ID and the moment of the data cutoff. */
export async function logExport(report: ReportKind, format: Format, f: Filters): Promise<{ report_id: string; generated_at: string }> {
  const { data, error } = await supabase.rpc('log_report_export', { p_report: report, p_format: format, p_filters: f })
  if (error) throw new Error(error.message.replace(/^[a-z_]+: /, ''))
  return data as { report_id: string; generated_at: string }
}

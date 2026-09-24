import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { FlaskConical } from 'lucide-react'
import { ToastProvider } from '../ui/Toast'
import { SessionProvider, useSession } from '../features/auth/session'
import { DEMO_AVAILABLE, isDemo } from '../demo/demo'
import { AreaRoute, Splash } from '../features/auth/AreaRoute'
import { CoreHome, ParentHome } from '../features/family/FamilyHomes'
import { UpdatePrompt } from './UpdatePrompt'

// Each staff area loads on first use, so a parent's phone never downloads the admin or iPad duty screens.
const AdminPeople = lazy(() => import('../features/admin/AdminPeople').then((m) => ({ default: m.AdminPeople })))
const AdminSettings = lazy(() => import('../features/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })))
const AuditLog = lazy(() => import('../features/admin/AuditLog').then((m) => ({ default: m.AuditLog })))
const Schedules = lazy(() => import('../features/school/Schedules').then((m) => ({ default: m.Schedules })))
const FrontDesk = lazy(() => import('../features/school/FrontDesk').then((m) => ({ default: m.FrontDesk })))
const OfficeMessages = lazy(() => import('../features/school/Messages').then((m) => ({ default: m.OfficeMessages })))
const Announce = lazy(() => import('../features/school/Announce').then((m) => ({ default: m.Announce })))
const ParentUpdates = lazy(() => import('../features/family/ParentPages').then((m) => ({ default: m.ParentUpdates })))
const ParentMessages = lazy(() => import('../features/family/ParentPages').then((m) => ({ default: m.ParentMessages })))
const ParentAccount = lazy(() => import('../features/family/ParentPages').then((m) => ({ default: m.ParentAccount })))
const CoordinatorsPage = lazy(() => import('../features/coordinators/CoordinatorsPage').then((m) => ({ default: m.CoordinatorsPage })))
const CoordinatorDuty = lazy(() => import('../features/duty/CoordinatorDuty'))
// The page a person collecting opens from WhatsApp: no sign-in, so it loads nothing else.
const CollectorLink = lazy(() => import('../features/link/CollectorLink'))

// Design preview with sample data: development builds and the separate design-review deployment only,
// never the production app (NFR-7).
const Preview = import.meta.env.DEV || import.meta.env.VITE_DESIGN_PREVIEW === 'true' ? lazy(() => import('../preview/PreviewRoutes')) : null

/** The pages inside the admin, core and front desk areas (the tabs in AreaShell). */
function AreaPages({ area, index }: { area: 'admin' | 'core' | 'pro'; index: ReactNode }) {
  return (
    <Routes>
      <Route index element={index} />
      {area === 'admin' && <Route path="child/:childId" element={index} />}
      {area === 'admin' && <Route path="settings" element={<AdminSettings />} />}
      {area === 'admin' && <Route path="audit" element={<AuditLog />} />}
      {area === 'core' && <Route path="schedules" element={<Schedules />} />}
      {area !== 'admin' && <Route path="messages" element={<OfficeMessages area={area} />} />}
      {area !== 'admin' && <Route path="announce" element={<Announce area={area} />} />}
      {area !== 'pro' && <Route path="coordinators" element={<CoordinatorsPage area={area} />} />}
      <Route path="*" element={<Navigate to={`/${area}`} replace />} />
    </Routes>
  )
}

/** The parent's pages (Today loads with the app; the others on first use). */
function ParentPages() {
  return (
    <Routes>
      <Route index element={<ParentHome />} />
      <Route path="updates" element={<ParentUpdates />} />
      <Route path="messages" element={<ParentMessages />} />
      <Route path="messages/:childId" element={<ParentMessages />} />
      <Route path="account" element={<ParentAccount />} />
      <Route path="*" element={<Navigate to="/parent" replace />} />
    </Routes>
  )
}

/** Always visible while demo mode is on, so sample data is never mistaken for the school's real records. */
function DemoBanner() {
  const { state, signOut } = useSession()
  // Above the parent's tab bar on phones.
  const parent = useLocation().pathname.startsWith('/parent')
  if (!DEMO_AVAILABLE || !isDemo() || state.status !== 'signed-in') return null
  return (
    <>
      {/* Room at the end of the page so the pill never covers the last row. */}
      <div className="h-20" aria-hidden />
      <div role="status" className={`glass fixed inset-x-0 z-50 mx-auto flex w-max max-w-[calc(100vw-32px)] items-center gap-2 rounded-full py-1 pl-3.5 pr-1 text-caption font-extrabold ${parent ? 'bottom-[calc(96px+env(safe-area-inset-bottom))] md:bottom-[max(12px,env(safe-area-inset-bottom))]' : 'bottom-[max(12px,env(safe-area-inset-bottom))]'}`}>
        <FlaskConical className="size-4 shrink-0 text-ink-2" aria-hidden />
        <span className="whitespace-nowrap">Demo · sample data</span>
        <button type="button" onClick={() => void signOut()} className="h-11 whitespace-nowrap rounded-full bg-sunken px-4 text-ink transition-colors duration-150 hover:bg-[var(--sunken-hover)]">Exit demo</button>
      </div>
    </>
  )
}

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/admin/*" element={<AreaRoute area="admin"><AreaPages index={<AdminPeople />} area="admin" /></AreaRoute>} />
              <Route path="/core/*" element={<AreaRoute area="core"><AreaPages index={<CoreHome />} area="core" /></AreaRoute>} />
              <Route path="/pro/*" element={<AreaRoute area="pro"><AreaPages index={<FrontDesk />} area="pro" /></AreaRoute>} />
              <Route path="/coordinator/*" element={<AreaRoute area="coordinator"><CoordinatorDuty /></AreaRoute>} />
              <Route path="/parent/*" element={<AreaRoute area="parent"><ParentPages /></AreaRoute>} />
              <Route path="/t/:token" element={<CollectorLink />} />
              {Preview && <Route path="/preview/*" element={<Preview />} />}
              {/* Anything else: the login screen, or the person's home area once signed in. */}
              <Route path="*" element={<AreaRoute area={null}>{null}</AreaRoute>} />
            </Routes>
          </Suspense>
          <DemoBanner />
        </BrowserRouter>
        <UpdatePrompt />
      </ToastProvider>
    </SessionProvider>
  )
}

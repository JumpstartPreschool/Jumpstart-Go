import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { useOnline } from '../ui/hooks'
import { Backdrop } from '../ui/Backdrop'
import { useDuty } from '../features/duty/useDuty'
import { StartDuty } from '../features/duty/StartDuty'
import { OnDuty } from '../features/duty/OnDuty'
import { SessionProvider } from '../features/auth/session'
import { AreaRoute } from '../features/auth/AreaRoute'
import { AccountButton } from '../features/auth/AreaShell'
import { AdminPeople } from '../features/admin/AdminPeople'
import { CoreHome, ParentHome } from '../features/family/FamilyHomes'

// Design preview with sample data: development builds and the separate design-review deployment only,
// never the production app (NFR-7).
const Preview = import.meta.env.DEV || import.meta.env.VITE_DESIGN_PREVIEW === 'true' ? lazy(() => import('../preview/PreviewRoutes')) : null

function CoordinatorDuty() {
  const duty = useDuty()
  const online = useOnline()
  if (duty.phase === 'on') return <OnDuty duty={duty} online={online} />
  return (
    <>
      <div className="fixed right-[max(16px,env(safe-area-inset-right))] top-[max(16px,env(safe-area-inset-top))] z-20">
        <AccountButton area="coordinator" />
      </div>
      <StartDuty duty={duty} online={online} />
    </>
  )
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Backdrop />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/admin/*" element={<AreaRoute area="admin"><AdminPeople /></AreaRoute>} />
            <Route path="/core/*" element={<AreaRoute area="core"><CoreHome /></AreaRoute>} />
            <Route path="/coordinator/*" element={<AreaRoute area="coordinator"><CoordinatorDuty /></AreaRoute>} />
            <Route path="/parent/*" element={<AreaRoute area="parent"><ParentHome /></AreaRoute>} />
            {Preview && <Route path="/preview/*" element={<Preview />} />}
            {/* Anything else: the login screen, or the person's home area once signed in. */}
            <Route path="*" element={<AreaRoute area={null}>{null}</AreaRoute>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  )
}

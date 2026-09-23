import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useOnline } from '../ui/hooks'
import { Backdrop } from '../ui/Backdrop'
import { useDuty } from '../features/duty/useDuty'
import { StartDuty } from '../features/duty/StartDuty'
import { OnDuty } from '../features/duty/OnDuty'

// Design preview with sample data: development builds only, never shipped to production (NFR-7).
const Preview = import.meta.env.DEV ? lazy(() => import('../preview/PreviewRoutes')) : null

function CoordinatorDuty() {
  const duty = useDuty()
  const online = useOnline()
  return duty.phase === 'on' ? <OnDuty duty={duty} online={online} /> : <StartDuty duty={duty} online={online} />
}

export function App() {
  return (
    <BrowserRouter>
      <Backdrop />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/coordinator" element={<CoordinatorDuty />} />
          {Preview && <Route path="/preview/*" element={<Preview />} />}
          {/* ponytail: every other path lands on a start page until login and role areas arrive in M1. */}
          <Route path="*" element={<Navigate to={Preview ? '/preview' : '/coordinator'} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

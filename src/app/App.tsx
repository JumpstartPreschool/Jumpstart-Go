import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useOnline } from '../ui/hooks'
import { useDuty } from '../features/duty/useDuty'
import { StartDuty } from '../features/duty/StartDuty'
import { OnDuty } from '../features/duty/OnDuty'

function CoordinatorDuty() {
  const duty = useDuty()
  const online = useOnline()
  return duty.phase === 'on' ? <OnDuty duty={duty} online={online} /> : <StartDuty duty={duty} online={online} />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/coordinator" element={<CoordinatorDuty />} />
        {/* ponytail: every path lands on the coordinator area until login and role areas arrive in M1. */}
        <Route path="*" element={<Navigate to="/coordinator" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

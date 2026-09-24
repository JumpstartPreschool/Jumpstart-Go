import { useOnline } from '../../ui/hooks'
import { AccountButton } from '../auth/AreaShell'
import { OnDuty } from './OnDuty'
import { StartDuty } from './StartDuty'
import { useDuty } from './useDuty'

/** The coordinator's iPad: Start duty, then the on-duty screen. Loaded only when a coordinator opens it. */
export default function CoordinatorDuty() {
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

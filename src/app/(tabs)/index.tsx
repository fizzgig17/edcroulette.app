import { Dashboard } from '@/components/dashboard';
import { Screen } from '@/components/screen';
import { SpinContent } from '@/components/spin-content';
import { useLayoutMode } from '@/lib/layout-mode';
import { usePullSpin, useSpinDock } from '@/lib/spin-dock';

export default function SpinScreen() {
  const { big, landscape, dashboard } = useLayoutMode();
  const { topSignal } = useSpinDock();
  const pullSpin = usePullSpin();
  if (dashboard) return <Dashboard />;
  return (
    <Screen title="EDC Roulette" tab hideTitle topSignal={topSignal} fullWidth={landscape && !big} onRefresh={pullSpin}>
      <SpinContent />
    </Screen>
  );
}

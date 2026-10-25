import { Dashboard } from '@/components/dashboard';
import { Screen } from '@/components/screen';
import { SpinContent } from '@/components/spin-content';
import { useLayoutMode } from '@/lib/layout-mode';
import { useSpinDock } from '@/lib/spin-dock';

export default function SpinScreen() {
  const { big, landscape, dashboard } = useLayoutMode();
  const { topSignal } = useSpinDock();
  if (dashboard) return <Dashboard />;
  return (
    <Screen title="EDC Roulette" tab hideTitle topSignal={topSignal} fullWidth={landscape && !big}>
      <SpinContent />
    </Screen>
  );
}

import { ChartPlaceholder } from '@hesabu/charts';

export default function HomePage() {
  return (
    <main>
      <h1>Hesabu</h1>
      {/* [[COPY-REVIEW]] */}
      <p>Weekly and monthly money reports, computed from your own messages.</p>
      <ChartPlaceholder title="Spending by category (placeholder)" />
    </main>
  );
}

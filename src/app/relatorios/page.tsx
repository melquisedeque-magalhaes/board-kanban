import { getDeliveryReport } from "@/server/reports";
import { syncCurrentUser } from "@/server/users";
import { ReportsApp } from "@/components/reports/ReportsApp";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  await syncCurrentUser();
  const report = await getDeliveryReport();
  return (
    <main>
      <ReportsApp initial={JSON.parse(JSON.stringify(report))} />
    </main>
  );
}

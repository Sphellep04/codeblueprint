import type { ImpactReport, ModuleMetrics } from "../types";
import { moduleNameForFile } from "../lib/module";

interface ImpactBannerProps {
  impact: ImpactReport;
  rootDir: string;
  modules: ModuleMetrics[];
}

export default function ImpactBanner({ impact, rootDir, modules }: ImpactBannerProps) {
  const fileCount = impact.impactedFiles.length;
  const routeCount = impact.impactedRoutes.length;

  const targetModule = modules.find((m) => m.name === moduleNameForFile(impact.targetFile, rootDir));
  const averageCoupling = modules.length > 0 ? modules.reduce((sum, m) => sum + m.coupling, 0) / modules.length : 0;
  const highCoupling = !!targetModule && targetModule.coupling > 0 && targetModule.coupling >= averageCoupling;

  return (
    <div className="impact-banner">
      <div className="impact-banner-stat">
        BLAST RADIUS: {fileCount} FILE{fileCount === 1 ? "" : "S"}
      </div>
      <div className="impact-banner-stat">
        {routeCount} ROUTE{routeCount === 1 ? "" : "S"} AFFECTED
      </div>
      {highCoupling && <div className="impact-banner-stat impact-banner-stat--risk">HIGH COUPLING DETECTED</div>}
    </div>
  );
}

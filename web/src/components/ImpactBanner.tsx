import type { ModuleMetrics } from "../types";
import type { ImpactHighlight } from "../lib/impactHighlight";
import { moduleNameForFile } from "../lib/module";

interface ImpactBannerProps {
  impact: ImpactHighlight;
  rootDir: string;
  modules: ModuleMetrics[];
}

export default function ImpactBanner({ impact, rootDir, modules }: ImpactBannerProps) {
  const fileCount = impact.impactedFiles.length;
  const routeCount = impact.impactedRoutes.length;

  const averageCoupling = modules.length > 0 ? modules.reduce((sum, m) => sum + m.coupling, 0) / modules.length : 0;
  // Any target's module counts — a multi-file Diff Impact is as risky as its riskiest changed file.
  const highCoupling = impact.targetFiles.some((file) => {
    const targetModule = modules.find((m) => m.name === moduleNameForFile(file, rootDir));
    return !!targetModule && targetModule.coupling > 0 && targetModule.coupling >= averageCoupling;
  });

  return (
    <div className="impact-banner">
      <div className="impact-banner-stat">
        {impact.label}: {fileCount} FILE{fileCount === 1 ? "" : "S"}
      </div>
      <div className="impact-banner-stat">
        {routeCount} ROUTE{routeCount === 1 ? "" : "S"} AFFECTED
      </div>
      {highCoupling && <div className="impact-banner-stat impact-banner-stat--risk">HIGH COUPLING DETECTED</div>}
    </div>
  );
}

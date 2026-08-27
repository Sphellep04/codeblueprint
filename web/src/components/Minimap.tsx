import { useEffect, useRef } from "react";
import type cytoscape from "cytoscape";

interface MinimapProps {
  cy: cytoscape.Core | null;
}

const WIDTH = 160;
const HEIGHT = 110;

export default function Minimap({ cy }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!cy || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const bb = cy!.elements().boundingBox();
      if (!isFinite(bb.w) || !isFinite(bb.h) || bb.w === 0 || bb.h === 0) return;
      const scale = Math.min(WIDTH / bb.w, HEIGHT / bb.h) * 0.9;
      const offsetX = (WIDTH - bb.w * scale) / 2 - bb.x1 * scale;
      const offsetY = (HEIGHT - bb.h * scale) / 2 - bb.y1 * scale;

      ctx!.clearRect(0, 0, WIDTH, HEIGHT);
      ctx!.fillStyle = "#4d7fff";
      cy!.nodes().forEach((node) => {
        const pos = node.position();
        ctx!.beginPath();
        ctx!.arc(pos.x * scale + offsetX, pos.y * scale + offsetY, 1.5, 0, Math.PI * 2);
        ctx!.fill();
      });

      const ext = cy!.extent();
      ctx!.strokeStyle = "#e8eaed";
      ctx!.lineWidth = 1;
      ctx!.strokeRect(ext.x1 * scale + offsetX, ext.y1 * scale + offsetY, ext.w * scale, ext.h * scale);

      canvas!.dataset.scale = String(scale);
      canvas!.dataset.offsetX = String(offsetX);
      canvas!.dataset.offsetY = String(offsetY);
    }

    draw();
    cy.on("pan zoom position", draw);
    return () => {
      cy.off("pan zoom position", draw);
    };
  }, [cy]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!cy || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Number(canvas.dataset.scale ?? "1");
    const offsetX = Number(canvas.dataset.offsetX ?? "0");
    const offsetY = Number(canvas.dataset.offsetY ?? "0");
    const graphX = (e.clientX - rect.left - offsetX) / scale;
    const graphY = (e.clientY - rect.top - offsetY) / scale;
    const zoom = cy.zoom();
    cy.animate({ pan: { x: cy.width() / 2 - graphX * zoom, y: cy.height() / 2 - graphY * zoom } }, { duration: 200 });
  };

  return <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="minimap" onClick={onClick} />;
}

import path from "node:path";
import pptxgen from "pptxgenjs";
import { outDir, publicDir } from "../config";
import { parseScenarioArg } from "../lib/args";
import { ensureBaseDirs, fileExists } from "../lib/files";
import { getScenario } from "../scenarios";

const stripHash = (value: string) => value.replace("#", "");

const addNotes = (slide: pptxgen.Slide, notes: string) => {
  const slideWithNotes = slide as pptxgen.Slide & { addNotes?: (value: string) => void };
  slideWithNotes.addNotes?.(notes);
};

const addFooter = (slide: pptxgen.Slide, accent: string) => {
  slide.addShape("line", {
    x: 0.55,
    y: 7.08,
    w: 12.2,
    h: 0,
    line: { color: stripHash(accent), width: 1 },
  });
  slide.addText("QOA Demo Studio · regenerable con Bun, Playwright y Remotion", {
    x: 0.58,
    y: 7.16,
    w: 8.2,
    h: 0.22,
    fontSize: 7.5,
    color: "64748B",
    margin: 0,
  });
};

await ensureBaseDirs();

for (const scenarioId of parseScenarioArg()) {
  const scenario = getScenario(scenarioId);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "QOA Demo Studio";
  pptx.subject = scenario.subtitle;
  pptx.title = scenario.title;
  pptx.company = "QOA";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  const cover = pptx.addSlide();
  cover.background = { color: "F8FAFC" };
  cover.addShape("rect", { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: "F8FAFC" }, line: { color: "F8FAFC" } });
  cover.addText("QOA DEMO STUDIO", {
    x: 0.75,
    y: 0.72,
    w: 4.5,
    h: 0.28,
    color: stripHash(scenario.accent),
    fontSize: 11,
    bold: true,
    margin: 0,
  });
  cover.addText(scenario.title, {
    x: 0.72,
    y: 1.42,
    w: 7.2,
    h: 1.65,
    fontSize: 34,
    bold: true,
    color: "111827",
    breakLine: false,
    fit: "shrink",
    margin: 0,
  });
  cover.addText(scenario.subtitle, {
    x: 0.75,
    y: 3.22,
    w: 6.8,
    h: 0.7,
    fontSize: 16,
    color: "334155",
    fit: "shrink",
    margin: 0,
  });
  cover.addShape("rect", {
    x: 8.4,
    y: 0.88,
    w: 3.9,
    h: 5.7,
    rectRadius: 0.12,
    fill: { color: "111827" },
    line: { color: stripHash(scenario.accent), width: 1 },
  });
  cover.addText(scenario.captions.join("\n"), {
    x: 8.85,
    y: 1.45,
    w: 3.05,
    h: 4.6,
    fontSize: 18,
    color: "FFFFFF",
    bold: true,
    fit: "shrink",
    valign: "middle",
    breakLine: false,
    margin: 0.05,
  });
  addNotes(cover, scenario.narrative.join("\n\n"));

  const story = pptx.addSlide();
  story.background = { color: "FFFFFF" };
  story.addText("Narrativa de venta", {
    x: 0.72,
    y: 0.58,
    w: 5,
    h: 0.38,
    fontSize: 18,
    bold: true,
    color: "111827",
    margin: 0,
  });
  scenario.narrative.forEach((line, index) => {
    story.addShape("ellipse", {
      x: 0.76,
      y: 1.36 + index * 1.42,
      w: 0.45,
      h: 0.45,
      fill: { color: stripHash(scenario.accent) },
      line: { color: stripHash(scenario.accent) },
    });
    story.addText(String(index + 1), {
      x: 0.76,
      y: 1.45 + index * 1.42,
      w: 0.45,
      h: 0.16,
      fontSize: 9,
      bold: true,
      color: "FFFFFF",
      align: "center",
      margin: 0,
    });
    story.addText(line, {
      x: 1.42,
      y: 1.28 + index * 1.42,
      w: 10.55,
      h: 0.76,
      fontSize: 20,
      color: "1F2937",
      fit: "shrink",
      margin: 0,
    });
  });
  addFooter(story, scenario.accent);
  addNotes(story, scenario.narrative.join("\n\n"));

  for (const [index, scene] of scenario.scenes.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: "F8FAFC" };
    slide.addText(`0${index + 1}`, {
      x: 0.72,
      y: 0.64,
      w: 0.8,
      h: 0.24,
      fontSize: 12,
      bold: true,
      color: stripHash(scenario.accent),
      margin: 0,
    });
    slide.addText(scene.title, {
      x: 0.72,
      y: 1.02,
      w: 4.2,
      h: 0.78,
      fontSize: 24,
      bold: true,
      color: "111827",
      fit: "shrink",
      margin: 0,
    });
    slide.addText(scene.caption, {
      x: 0.72,
      y: 1.94,
      w: 4.05,
      h: 0.88,
      fontSize: 15,
      color: "334155",
      fit: "shrink",
      margin: 0,
    });
    slide.addText(scenario.captions[index] ?? scene.caption, {
      x: 0.72,
      y: 5.82,
      w: 4.2,
      h: 0.46,
      fontSize: 14,
      bold: true,
      color: "111827",
      fit: "shrink",
      margin: 0,
    });
    const imagePath = path.join(publicDir, scene.screenshot);
    if (await fileExists(imagePath)) {
      slide.addImage({
        path: imagePath,
        x: scene.phone ? 6.2 : 5.2,
        y: 0.65,
        w: scene.phone ? 3.15 : 7.25,
        h: scene.phone ? 6.2 : 5.18,
      });
    } else {
      slide.addShape("rect", {
        x: 5.2,
        y: 0.65,
        w: 7.25,
        h: 5.18,
        rectRadius: 0.08,
        fill: { color: "E2E8F0" },
        line: { color: "CBD5E1" },
      });
      slide.addText("Screenshot pendiente\nEjecuta demo:record", {
        x: 6.3,
        y: 2.65,
        w: 5,
        h: 0.7,
        fontSize: 18,
        color: "475569",
        bold: true,
        align: "center",
        margin: 0,
      });
    }
    addFooter(slide, scenario.accent);
    addNotes(slide, `${scene.title}\n\n${scene.caption}`);
  }

  const close = pptx.addSlide();
  close.background = { color: "111827" };
  close.addText("Cómo se potencia con IA", {
    x: 0.72,
    y: 0.76,
    w: 5.2,
    h: 0.32,
    color: stripHash(scenario.accent),
    fontSize: 14,
    bold: true,
    margin: 0,
  });
  close.addText("La operación genera datos confiables mientras el usuario trabaja en lenguaje natural.", {
    x: 0.72,
    y: 1.58,
    w: 9.8,
    h: 1.34,
    fontSize: 30,
    bold: true,
    color: "FFFFFF",
    fit: "shrink",
    margin: 0,
  });
  close.addText("Voz, imagen y geografía dejan de ser pasos aislados: se vuelven interfaces para venta, inventario y activación comercial.", {
    x: 0.76,
    y: 3.35,
    w: 9.3,
    h: 0.86,
    fontSize: 17,
    color: "CBD5E1",
    fit: "shrink",
    margin: 0,
  });
  addNotes(close, "Cierre sugerido: QOA reduce captura manual y convierte cada interacción de tienda en señales medibles para fidelización y crecimiento.");

  const output = path.join(outDir, `${scenario.id}.pptx`);
  await pptx.writeFile({ fileName: output });
  console.log(`Deck written: ${output}`);
}

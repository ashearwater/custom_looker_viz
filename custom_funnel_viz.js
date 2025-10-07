/ Funnel — Inside Labels (Looker Custom Visualization)
// Works with: 1 dimension (funnel stage) + 1 measure (value)
// Labels are rendered inside each trapezoid step, using Looker's own formatting.

looker.plugins.visualizations.add({
  id: "funnel_inside_labels",
  label: "Funnel — Inside Labels",
  options: {
    label_template: {
      type: "string",
      label: "Label Template",
      section: "Labels",
      default: "{{stage}} — {{value}} ({{pct}})"
    },
    show_percent: {
      type: "boolean",
      label: "Show % of first stage",
      section: "Labels",
      default: true
    },
    min_step_height: {
      type: "number",
      label: "Min Step Height (px)",
      section: "Layout",
      default: 44
    },
    gap: {
      type: "number",
      label: "Gap Between Steps (px)",
      section: "Layout",
      default: 8
    },
    top_width_pct: {
      type: "number",
      label: "Top Width (%)",
      section: "Layout",
      default: 100
    },
    min_width_pct: {
      type: "number",
      label: "Min Width (%)",
      section: "Layout",
      default: 20
    },
    rounded: {
      type: "boolean",
      label: "Rounded Corners",
      section: "Style",
      default: true
    },
    text_size: {
      type: "number",
      label: "Label Font Size (px)",
      section: "Style",
      default: 13
    },
    text_contrast: {
      type: "string",
      label: "Text Color",
      section: "Style",
      display: "select",
      default: "auto",
      values: [
        {"Auto (contrast)": "auto"},
        {"Always white": "white"},
        {"Always black": "black"}
      ]
    }
  },

  create: function (element, config) {
    element.innerHTML = "";
    element.style.fontFamily = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif';

    const style = document.createElement("style");
    style.textContent = `
      .funnel-wrap { width:100%; height:100%; position:relative; }
      .funnel-svg { width:100%; height:100%; }
      .funnel-label { font-weight: 600; pointer-events: none; dominant-baseline: middle; text-anchor: middle; }
      .funnel-step { cursor: pointer; }
    `;
    element.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "funnel-wrap";
    element.appendChild(wrap);

    this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this._svg.classList.add("funnel-svg");
    wrap.appendChild(this._svg);
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    // Basic validation
    const dims = (queryResponse.fields && queryResponse.fields.dimensions) || [];
    const meas = (queryResponse.fields && queryResponse.fields.measure_like) || [];

    if (dims.length < 1 || meas.length < 1) {
      this.addError({
        group: "req",
        title: "Add fields",
        message: "This viz expects 1 dimension (stage) and 1 measure (value)."
      });
      done();
      return;
    }
    this.clearErrors("req");

    const dim = dims[0];
    const measure = meas[0];

    // Normalize rows from Looker result set
    const rows = data.map((row) => {
      const dimCell = row[dim.name];
      const measureCell = row[measure.name];

      const label = LookerCharts.Utils.textForCell(dimCell); // stage label
      const valueRaw = Number(measureCell && measureCell.value || 0);
      const valueText = LookerCharts.Utils.textForCell(measureCell); // formatted by Looker

      return {
        stage: label,
        value: isFinite(valueRaw) ? valueRaw : 0,
        valueCell: measureCell, // keep for drill
        valueText
      };
    });

    if (!rows.length) {
      this.addError({
        group: "empty",
        title: "No data",
        message: "Your query returned no rows."
      });
      done();
      return;
    }
    this.clearErrors("empty");

    // Layout config
    const minH = Math.max(20, Number(config.min_step_height) || 44);
    const gap = Math.max(0, Number(config.gap) || 8);
    const topWidthPct = Math.min(100, Math.max(10, Number(config.top_width_pct) || 100));
    const minWidthPct = Math.min(99, Math.max(1, Number(config.min_width_pct) || 20));
    const rounded = !!config.rounded;
    const fontSize = Math.max(8, Number(config.text_size) || 13);
    const textMode = config.text_contrast || "auto";
    const showPct = config.show_percent !== false;

    // Sizing
    const W = element.clientWidth || 800;
    const totalH = Math.max(
      rows.length * minH + (rows.length - 1) * gap,
      (element.clientHeight || 0)
    );
    const H = totalH || rows.length * (minH + gap) + 10;

    const svg = this._svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    // Value scale (relative to first stage)
    const topVal = rows[0].value > 0 ? rows[0].value : Math.max(...rows.map(r => r.value));
    const widthFor = (v) => {
      if (topVal <= 0) return (minWidthPct / 100) * W;
      return Math.max(minWidthPct / 100 * W, (v / topVal) * (topWidthPct / 100) * W);
    };

    const stepHeight = Math.max(minH, (H - (rows.length - 1) * gap) / rows.length);
    const centerX = W / 2;

    // Simple pleasant palette (dark → light)
    const baseHue = 220; // blue-ish
    const colorFor = (i) => `hsl(${baseHue}, 60%, ${Math.max(28, 50 - i * 4)}%)`;

    // Build steps
    let y = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const wTop = widthFor(r.value);
      const next = rows[i + 1];
      const wBottom = next ? widthFor(next.value) : Math.max(minWidthPct / 100 * W, wTop * 0.85);

      const xTL = centerX - wTop / 2;
      const xTR = centerX + wTop / 2;
      const xBL = centerX - wBottom / 2;
      const xBR = centerX + wBottom / 2;
      const yTop = y;
      const yBot = y + stepHeight;

      // Draw trapezoid polygon
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", `${xTL},${yTop} ${xTR},${yTop} ${xBR},${yBot} ${xBL},${yBot}`);
      poly.setAttribute("fill", colorFor(i));
      poly.classList.add("funnel-step");

      if (rounded) {
        // Rounded corners via clipping path (approx)
        const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        const clipId = `clip-${i}-${Math.random().toString(36).slice(2)}`;
        clip.setAttribute("id", clipId);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", Math.min(xTL, xBL));
        rect.setAttribute("width", Math.max(xTR, xBR) - Math.min(xTL, xBL));
        rect.setAttribute("y", yTop);
        rect.setAttribute("height", stepHeight);
        rect.setAttribute("rx", Math.min(12, stepHeight / 3));
        clip.appendChild(rect);
        svg.appendChild(clip);
        poly.setAttribute("clip-path", `url(#${clipId})`);
      }

      // Drill support
      poly.addEventListener("click", (event) => {
        const cell = r.valueCell;
        if (cell && cell.links && cell.links.length) {
          LookerCharts.Utils.openDrillMenu({ links: cell.links, event });
        }
      });

      svg.appendChild(poly);

      // Label text
      const pct = topVal > 0 ? (r.value / topVal) * 100 : 0;
      const pctTxt = `${Math.round(pct * 10) / 10}%`;
      const label = (config.label_template || "{{stage}} — {{value}} ({{pct}})")
        .replace("{{stage}}", r.stage)
        .replace("{{value}}", r.valueText)
        .replace("{{pct}}", pctTxt);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.classList.add("funnel-label");
      text.setAttribute("x", centerX);
      text.setAttribute("y", yTop + stepHeight / 2);
      text.setAttribute("font-size", String(fontSize));
      text.textContent = showPct ? label : label.replace(/\s*\(\s*\d+(\.\d+)?%\s*\)\s*$/, "");

      // Choose text color
      let fill = "#fff";
      if (textMode === "black") fill = "#111";
      else if (textMode === "white") fill = "#fff";
      else {
        // Auto contrast using L* estimate from HSL lightness we set
        const lightness = 50 - i * 4;
        fill = lightness < 40 ? "#fff" : "#111";
      }
      text.setAttribute("fill", fill);

      svg.appendChild(text);

      // Increment y
      y += stepHeight + gap;
    }

    done();
  }
});
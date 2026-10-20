(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
  const compact = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  };

  document.documentElement.dataset.ready = "false";
  window.__ATLAS_ERROR__ = null;
  window.addEventListener("error", (event) => {
    window.__ATLAS_ERROR__ = String(event.message || event.error || "unknown error");
  });

  const modeMeta = {
    swa: { label: "SWA", cn: "滑动窗口", color: [81, 212, 232] },
    full: { label: "Full", cn: "完整 CSA2", color: [111, 140, 255] },
    reindex: { label: "Reindex", cn: "重选索引", color: [242, 193, 92] },
    reuse: { label: "Reuse", cn: "复用 KV + 索引", color: [82, 94, 118] }
  };

  const layers = Array.from({ length: 40 }, (_, i) => {
    if (i < 2) {
      return { index: i, phase: "Encoder", mode: "swa", ratio: null, group: 0, engram: i === 1 };
    }
    if (i < 20) {
      const j = i - 2;
      const group = Math.floor(j / 6);
      const pos = j % 6;
      return {
        index: i,
        phase: "Encoder",
        mode: pos === 0 ? "full" : "reuse",
        ratio: 2,
        group: group + 1,
        engram: i === 14
      };
    }
    const j = i - 20;
    const group = Math.floor(j / 4);
    const pos = j % 4;
    return {
      index: i,
      phase: "Decoder",
      mode: pos === 0 ? (group === 0 ? "full" : "reindex") : "reuse",
      ratio: 1,
      group: group + 1,
      engram: false
    };
  });

  const layerDescriptions = {
    swa: "纯滑动窗口注意力。只处理最近 128 个 token 的局部窗口，不建立全局 KV；这是 CED 能省掉大量 prefill 计算的前提。",
    full: "完整 CSA2。当前层生成自己的 Main KV 与 Indexer K，运行索引器，并为每个 query 选出新的 Top-512 全局 KV 条目。",
    reindex: "复用最近一次 Full 层的 Main KV 与 Indexer K，但用自己的 Indexer Q 重新打分，产出新的 Top-512。KV 共享，索引不共享。",
    reuse: "直接复用最近的 Main KV 与 Top-K 索引，不再运行索引器。当前层仍然计算自己的 Main Q 与 SWA KV，并执行稀疏注意力。"
  };

  const layerFactFor = (layer) => {
    if (!layer) {
      return [
        ["网络层数", "40"],
        ["Encoder / Decoder", "20 / 20"],
        ["专家数", "384 + 1"],
        ["Top-K 检索", "512"]
      ];
    }
    const group = layer.group ? `G${layer.group}` : "—";
    return [
      ["层号", String(layer.index).padStart(2, "0")],
      ["阶段", layer.phase],
      ["模式", modeMeta[layer.mode].label],
      ["分组", group]
    ];
  };

  // Hero spine
  const buildHeroStack = (id, start) => {
    const root = document.getElementById(id);
    if (!root) return;
    for (let i = start; i < start + 20; i += 1) {
      const layer = layers[i];
      const bar = document.createElement("div");
      bar.className = `mini-layer ${layer.mode}`;
      bar.style.animationDelay = `${(i - start) * 22}ms`;
      bar.title = `Layer ${i} · ${modeMeta[layer.mode].label}`;
      root.appendChild(bar);
    }
  };
  buildHeroStack("hero-encoder", 0);
  buildHeroStack("hero-decoder", 20);

  // Header, mobile nav, reading progress
  const header = $("#site-header");
  const progress = $("#reading-progress");
  const mobileNav = $("#mobile-nav");
  const menuBtn = $("#menu-btn");
  const updateScrollUI = () => {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle("scrolled", scrollY > 18);
    const height = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${height > 0 ? (scrollY / height) * 100 : 0}%`;
  };
  window.addEventListener("scroll", updateScrollUI, { passive: true });
  updateScrollUI();

  menuBtn.addEventListener("click", () => {
    const open = menuBtn.getAttribute("aria-expanded") !== "true";
    menuBtn.setAttribute("aria-expanded", String(open));
    mobileNav.classList.toggle("open", open);
  });
  $$("a", mobileNav).forEach((link) => link.addEventListener("click", () => {
    mobileNav.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }));

  // Reveal
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => revealObserver.observe(el));

  const sectionIds = ["top", "atlas", "ced", "csa2", "indexer", "kv", "sparsity", "dspark", "posttrain", "evidence", "summary"];
  const railLinks = $$("#side-rail a");
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      railLinks.forEach((link) => link.classList.toggle("active", link.dataset.section === id));
    });
  }, { threshold: 0.16, rootMargin: "-20% 0px -60% 0px" });
  sectionIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) sectionObserver.observe(el);
  });

  // Make section ribbons
  const makeRibbon = (root, className, onClick) => {
    if (!root) return [];
    root.innerHTML = "";
    const cells = layers.map((layer) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `${className} ${layer.mode}${layer.index === 20 ? " decoder-start" : ""}`;
      cell.dataset.index = String(layer.index);
      cell.title = `Layer ${layer.index} · ${layer.phase} · ${modeMeta[layer.mode].label}`;
      cell.setAttribute("aria-label", cell.title);
      cell.addEventListener("click", () => onClick(layer.index));
      root.appendChild(cell);
      return cell;
    });
    return cells;
  };

  // Atlas 3D canvas
  const atlasCanvas = $("#atlas-canvas");
  const atlasWrap = atlasCanvas ? atlasCanvas.parentElement : null;
  const atlasTooltip = $("#atlas-tooltip");
  const atlasPhaseLabel = $("#atlas-phase-label");
  const atlasActiveParams = $("#atlas-active-params");
  const atlasRotateBtn = $("#atlas-rotate");
  const atlasPlayBtn = $("#atlas-play");
  const atlasState = {
    yaw: -0.48,
    pitch: 0.13,
    zoom: 1,
    targetYaw: -0.48,
    targetPitch: 0.13,
    targetZoom: 1,
    autoRotate: true,
    phase: "prefill",
    selected: -1,
    hover: -1,
    dragging: false,
    dragX: 0,
    dragY: 0,
    lastX: 0,
    lastY: 0,
    playing: false,
    playT: 0.22,
    time: 0,
    hitRegions: [],
    visible: true,
    width: 0,
    height: 0,
    dpr: 1
  };

  const setupCanvas = (canvas, state, onResize) => {
    if (!canvas) return null;
    const parent = canvas.parentElement;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      state.width = width;
      state.height = height;
      state.dpr = dpr;
      if (onResize) onResize(width, height);
    };
    resize();
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(resize);
      observer.observe(parent);
    } else {
      window.addEventListener("resize", resize);
    }
    return resize;
  };

  const atlasProject = (x, y, z) => {
    const cy = Math.cos(atlasState.yaw);
    const sy = Math.sin(atlasState.yaw);
    const cx = Math.cos(atlasState.pitch);
    const sx = Math.sin(atlasState.pitch);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y1 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;
    const base = Math.min(atlasState.width, atlasState.height);
    const scale = base * 0.083 * atlasState.zoom * (1 - z2 * 0.008);
    return {
      x: atlasState.width / 2 + x1 * scale,
      y: atlasState.height / 2 - y1 * scale + base * 0.012,
      z: z2,
      s: scale
    };
  };

  const atlasLayerCenter = (index) => {
    const isEncoder = index < 20;
    const local = isEncoder ? index : index - 20;
    return {
      x: isEncoder ? -1.32 : 1.32,
      y: -4.42 + local * 0.455,
      z: 0
    };
  };

  const drawQuad = (ctx, points, fill, stroke, lineWidth = 1) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  const pointInQuad = (px, py, q) => {
    let inside = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      const xi = q[i].x;
      const yi = q[i].y;
      const xj = q[j].x;
      const yj = q[j].y;
      const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const drawAtlas = (ts) => {
    if (!atlasCanvas) return;
    const ctx = atlasCanvas.getContext("2d");
    const { width: w, height: h, dpr } = atlasState;
    if (!w || !h) return;

    const dt = Math.min(40, ts - (atlasState.lastTs || ts));
    atlasState.lastTs = ts;
    atlasState.time += dt / 1000;

    if (atlasState.autoRotate && !atlasState.dragging) {
      atlasState.targetYaw += dt * 0.000055;
    }
    atlasState.yaw = lerp(atlasState.yaw, atlasState.targetYaw, 0.075);
    atlasState.pitch = lerp(atlasState.pitch, atlasState.targetPitch, 0.075);
    atlasState.zoom = lerp(atlasState.zoom, atlasState.targetZoom, 0.09);

    if (atlasState.playing && atlasState.visible) {
      atlasState.playT += dt / 5200;
      if (atlasState.playT > 1) atlasState.playT -= 1;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background grid floor
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let gx = -3.8; gx <= 3.8; gx += 0.55) {
      const a = atlasProject(gx, -4.9, -2.2);
      const b = atlasProject(gx, -4.9, 2.2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(108, 132, 184, 0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let gz = -2.2; gz <= 2.2; gz += 0.55) {
      const a = atlasProject(-3.8, -4.9, gz);
      const b = atlasProject(3.8, -4.9, gz);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(108, 132, 184, 0.06)";
      ctx.stroke();
    }
    ctx.restore();

    // CE
    const faces = [];
    const topQuads = [];
    const boxW = 0.88;
    const boxD = 0.38;
    const boxH = 0.055;

    layers.forEach((layer) => {
      const c = atlasLayerCenter(layer.index);
      const isSelected = atlasState.selected === layer.index;
      const isHover = atlasState.hover === layer.index;
      const dim = atlasState.phase === "prefill" && layer.phase === "Decoder";
      let alpha = dim ? 0.25 : 0.9;
      if (isSelected || isHover) alpha = 1;
      const base = modeMeta[layer.mode].color;
      const bright = isSelected ? 1.34 : isHover ? 1.2 : 1;

      const verts = {
        a: [c.x - boxW, c.y - boxH, c.z + boxD],
        b: [c.x + boxW, c.y - boxH, c.z + boxD],
        c: [c.x + boxW, c.y + boxH, c.z + boxD],
        d: [c.x - boxW, c.y + boxH, c.z + boxD],
        e: [c.x - boxW, c.y - boxH, c.z - boxD],
        f: [c.x + boxW, c.y - boxH, c.z - boxD],
        g: [c.x + boxW, c.y + boxH, c.z - boxD],
        h: [c.x - boxW, c.y + boxH, c.z - boxD]
      };
      const p = {};
      Object.keys(verts).forEach((k) => { p[k] = atlasProject(...verts[k]); });
      const top = [p.d, p.c, p.g, p.h];
      const front = [p.a, p.b, p.c, p.d];
      const side = [p.b, p.f, p.g, p.c];
      const bottom = [p.e, p.f, p.b, p.a];
      topQuads.push({ index: layer.index, quad: top, depth: (p.d.z + p.c.z + p.g.z + p.h.z) / 4 });

      const pushFace = (quad, shade, edge) => {
        const depth = quad.reduce((sum, pt) => sum + pt.z, 0) / quad.length;
        const r = Math.min(255, Math.round(base[0] * bright * shade));
        const g = Math.min(255, Math.round(base[1] * bright * shade));
        const b = Math.min(255, Math.round(base[2] * bright * shade));
        faces.push({
          quad,
          depth,
          fill: `rgba(${r}, ${g}, ${b}, ${alpha * (shade > 1 ? 0.9 : 0.78)})`,
          stroke: `rgba(${Math.min(255, r + 45)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 45)}, ${alpha * 0.62})`,
          edge,
          selected: isSelected || isHover
        });
      };
      pushFace(top, isHover || isSelected ? 1.5 : 1.25, true);
      pushFace(front, 0.68, false);
      pushFace(side, 0.52, false);
      pushFace(bottom, 0.34, false);

      if (layer.engram) {
        const ring = atlasProject(c.x + boxW + 0.1, c.y, c.z + boxD);
        faces.push({ ring: true, x: ring.x, y: ring.y, depth: ring.z - 0.02, selected: false });
      }
    });

    faces.sort((a, b) => b.depth - a.depth);
    ctx.save();
    faces.forEach((face) => {
      if (face.ring) {
        ctx.beginPath();
        ctx.arc(face.x, face.y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100, 229, 194, 0.9)";
        ctx.fill();
        return;
      }
      if (face.selected) {
        ctx.shadowBlur = 16;
        ctx.shadowColor = "rgba(155, 176, 255, 0.8)";
      }
      drawQuad(ctx, face.quad, face.fill, face.stroke, face.selected ? 1.3 : 0.75);
      ctx.shadowBlur = 0;
    });
    ctx.restore();

    atlasState.hitRegions = topQuads
      .map((item) => ({ index: item.index, quad: item.quad, depth: item.depth }))
      .sort((a, b) => a.depth - b.depth);

    // Vertical spine and bridge
    const encBottom = atlasLayerCenter(0);
    const encTop = atlasLayerCenter(19);
    const decBottom = atlasLayerCenter(20);
    const decTop = atlasLayerCenter(39);
    const spineA = atlasProject(encBottom.x, encBottom.y - 0.2, -0.42);
    const spineB = atlasProject(encTop.x, encTop.y + 0.2, -0.42);
    const decA = atlasProject(decBottom.x, decBottom.y - 0.2, -0.42);
    const decB = atlasProject(decTop.x, decTop.y + 0.2, -0.42);
    ctx.save();
    ctx.strokeStyle = "rgba(81, 212, 232, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(spineA.x, spineA.y); ctx.lineTo(spineB.x, spineB.y); ctx.stroke();
    ctx.strokeStyle = "rgba(111, 140, 255, 0.28)";
    ctx.beginPath(); ctx.moveTo(decA.x, decA.y); ctx.lineTo(decB.x, decB.y); ctx.stroke();

    const bridgeA = atlasProject(encTop.x + 0.2, encTop.y, -0.35);
    const bridgeB = atlasProject(decBottom.x - 0.2, decBottom.y, -0.35);
    const mid = atlasProject(0, (encTop.y + decBottom.y) / 2 + 0.4, -0.35);
    ctx.beginPath();
    ctx.moveTo(bridgeA.x, bridgeA.y);
    ctx.quadraticCurveTo(mid.x, mid.y - 46, bridgeB.x, bridgeB.y);
    ctx.strokeStyle = "rgba(100, 229, 194, 0.55)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "600 9px " + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = "rgba(157, 245, 220, 0.9)";
    ctx.textAlign = "center";
    ctx.fillText("H₂₀ → KV", mid.x, mid.y - 8);

    // Tower labels
    const labelEnc = atlasProject(-1.32, -5.07, 0);
    const labelDec = atlasProject(1.32, -5.07, 0);
    ctx.font = "600 8px " + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = "rgba(115, 212, 229, 0.72)";
    ctx.fillText("CAUSAL ENCODER", labelEnc.x, labelEnc.y);
    ctx.fillStyle = "rgba(145, 165, 255, 0.72)";
    ctx.fillText("DECODER", labelDec.x, labelDec.y);
    ctx.restore();

    // Token path
    const drawParticleAt = (t, alpha = 1) => {
      let x;
      let y;
      if (atlasState.phase === "prefill") {
        if (t < 0.8) {
          x = encBottom.x;
          y = lerp(encBottom.y - 0.45, encTop.y + 0.1, t / 0.8);
        } else {
          const tt = (t - 0.8) / 0.2;
          const a = atlasProject(encTop.x, encTop.y, 0);
          const b = atlasProject(decTop.x, decTop.y + 0.35, 0);
          x = null;
          const pp = { x: lerp(a.x, b.x, tt), y: lerp(a.y, b.y, tt) - Math.sin(tt * Math.PI) * 36 };
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, 3.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(100, 229, 194, ${alpha})`;
          ctx.shadowBlur = 16;
          ctx.shadowColor = "rgba(100, 229, 194, 0.9)";
          ctx.fill();
          ctx.shadowBlur = 0;
          return;
        }
      } else {
        if (t < 0.5) {
          x = encBottom.x;
          y = lerp(encBottom.y - 0.45, encTop.y + 0.1, t / 0.5);
        } else if (t < 0.58) {
          const tt = (t - 0.5) / 0.08;
          const a = atlasProject(encTop.x, encTop.y, 0.2);
          const b = atlasProject(decBottom.x, decBottom.y - 0.45, 0.2);
          const pp = { x: lerp(a.x, b.x, tt), y: lerp(a.y, b.y, tt) - Math.sin(tt * Math.PI) * 26 };
          x = null;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, 3.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(111, 140, 255, ${alpha})`;
          ctx.shadowBlur = 16;
          ctx.shadowColor = "rgba(111, 140, 255, 0.9)";
          ctx.fill();
          ctx.shadowBlur = 0;
          return;
        } else {
          x = decBottom.x;
          y = lerp(decBottom.y - 0.45, decTop.y + 0.1, (t - 0.58) / 0.42);
        }
      }
      const p = atlasProject(x, y, 0.55);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(207, 232, 255, ${alpha})`;
      ctx.shadowBlur = 18;
      ctx.shadowColor = "rgba(111, 140, 255, 0.85)";
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const baseT = atlasState.playing ? atlasState.playT : 0.62;
    drawParticleAt(baseT, 1);
    drawParticleAt((baseT - 0.1 + 1) % 1, 0.45);
    drawParticleAt((baseT - 0.2 + 1) % 1, 0.18);

    requestAnimationFrame(drawAtlas);
  };

  setupCanvas(atlasCanvas, atlasState);
  if (atlasCanvas) {
    requestAnimationFrame(drawAtlas);
    const atlasObserver = new IntersectionObserver((entries) => {
      atlasState.visible = entries[0].isIntersecting;
    }, { threshold: 0 });
    atlasObserver.observe(atlasCanvas);
  }

  const updateAtlasPanel = (index) => {
    const layer = index >= 0 ? layers[index] : null;
    $("#layer-number").textContent = layer ? String(layer.index).padStart(2, "0") : "ALL";
    $("#layer-mode").textContent = layer ? `${layer.phase} · ${modeMeta[layer.mode].label}` : "40 层总览";
    $("#layer-title").textContent = layer
      ? `${layer.phase} Layer ${layer.index}：${modeMeta[layer.mode].cn}`
      : "从输入到输出，发生了什么？";
    $("#layer-desc").textContent = layer
      ? layerDescriptions[layer.mode]
      : "选择左侧任意一层，查看它的注意力模式、是否复用 KV、是否重新计算 Top-K 索引。";
    const facts = $("#layer-facts");
    facts.innerHTML = layerFactFor(layer)
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    const badge = $("#mode-badge");
    if (layer) {
      badge.className = `mode-badge ${layer.mode}`;
      const ratio = layer.ratio ? ` · m=${layer.ratio}` : "";
      badge.textContent = `${modeMeta[layer.mode].label}${ratio}${layer.engram ? " · Engram 模块" : ""}`;
    } else {
      badge.className = "mode-badge";
      badge.textContent = "点击层以展开";
    }
    $$(".schedule-cell, .sd-cell").forEach((cell) => {
      cell.classList.toggle("active", layer && Number(cell.dataset.index) === layer.index);
    });
  };

  const selectLayer = (index) => {
    atlasState.selected = index;
    updateAtlasPanel(index);
    if (index >= 0) {
      const layer = layers[index];
      setCsaMode(layer.mode, true);
      $("#csa2-layer-readout").textContent = `Layer ${String(index).padStart(2, "0")} · ${layer.phase} · ${modeMeta[layer.mode].label}${layer.ratio ? " · compression m=" + layer.ratio : ""}`;
    }
  };

  // Atlas interactions
  if (atlasCanvas) {
    atlasCanvas.addEventListener("pointerdown", (event) => {
      atlasState.dragging = true;
      atlasState.dragX = event.clientX;
      atlasState.dragY = event.clientY;
      atlasState.lastX = event.clientX;
      atlasState.lastY = event.clientY;
      atlasCanvas.setPointerCapture(event.pointerId);
    });
    atlasCanvas.addEventListener("pointermove", (event) => {
      const rect = atlasCanvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (atlasState.dragging) {
        const dx = event.clientX - atlasState.lastX;
        const dy = event.clientY - atlasState.lastY;
        atlasState.lastX = event.clientX;
        atlasState.lastY = event.clientY;
        atlasState.targetYaw += dx * 0.006;
        atlasState.targetPitch = clamp(atlasState.targetPitch - dy * 0.004, -0.5, 0.55);
        atlasTooltip.classList.remove("visible");
        return;
      }
      let hit = -1;
      for (let i = atlasState.hitRegions.length - 1; i >= 0; i -= 1) {
        const item = atlasState.hitRegions[i];
        if (pointInQuad(px, py, item.quad)) {
          hit = item.index;
          break;
        }
      }
      atlasState.hover = hit;
      if (hit >= 0) {
        const layer = layers[hit];
        atlasTooltip.innerHTML = `<b>Layer ${String(hit).padStart(2, "0")}</b> · ${layer.phase}<br>${modeMeta[layer.mode].label}${layer.engram ? " · Engram" : ""}`;
        atlasTooltip.style.left = `${px}px`;
        atlasTooltip.style.top = `${py}px`;
        atlasTooltip.classList.add("visible");
        atlasCanvas.style.cursor = "pointer";
      } else {
        atlasTooltip.classList.remove("visible");
        atlasCanvas.style.cursor = atlasState.dragging ? "grabbing" : "grab";
      }
    });
    const endDrag = (event) => {
      if (!atlasState.dragging) return;
      atlasState.dragging = false;
      if (Math.abs(event.clientX - atlasState.dragX) + Math.abs(event.clientY - atlasState.dragY) < 5) {
        if (atlasState.hover >= 0) selectLayer(atlasState.hover);
      }
    };
    atlasCanvas.addEventListener("pointerup", endDrag);
    atlasCanvas.addEventListener("pointerleave", () => {
      atlasState.dragging = false;
      atlasState.hover = -1;
      atlasTooltip.classList.remove("visible");
    });
    atlasCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      atlasState.targetZoom = clamp(atlasState.targetZoom - event.deltaY * 0.0009, 0.72, 1.65);
    }, { passive: false });
    atlasCanvas.addEventListener("dblclick", () => {
      atlasState.targetYaw = -0.48;
      atlasState.targetPitch = 0.13;
      atlasState.targetZoom = 1;
      atlasState.selected = -1;
      updateAtlasPanel(-1);
    });
    atlasRotateBtn?.addEventListener("click", () => {
      atlasState.autoRotate = !atlasState.autoRotate;
      atlasRotateBtn.setAttribute("aria-pressed", String(atlasState.autoRotate));
      atlasRotateBtn.textContent = atlasState.autoRotate ? "自动旋转" : "已暂停";
    });
    $("#atlas-reset")?.addEventListener("click", () => {
      atlasState.targetYaw = -0.48;
      atlasState.targetPitch = 0.13;
      atlasState.targetZoom = 1;
    });
    atlasPlayBtn?.addEventListener("click", () => {
      atlasState.playing = !atlasState.playing;
      atlasPlayBtn.classList.toggle("playing", atlasState.playing);
      atlasPlayBtn.querySelector(".play-text").textContent = atlasState.playing ? "暂停 token 路径" : "播放 token 路径";
    });
    $$(".atlas-bottombar .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".atlas-bottombar .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        atlasState.phase = btn.dataset.phase;
        atlasPhaseLabel.textContent = atlasState.phase.toUpperCase();
        atlasActiveParams.textContent = atlasState.phase === "prefill" ? "8B" : "16B";
      });
    });
  }

  const scheduleCells = makeRibbon($("#schedule-ribbon"), "schedule-cell", selectLayer);
  const csaRibbonCells = makeRibbon($("#csa2-ribbon"), "sd-cell", (index) => {
    selectLayer(index);
  });
  updateAtlasPanel(-1);

  // CED
  const cedSlider = $("#ced-length");
  const cedFullBlocks = $("#ced-full-blocks");
  const cedCedBlocks = $("#ced-ced-blocks");
  if (cedFullBlocks) {
    for (let i = 0; i < 40; i += 1) {
      const block = document.createElement("div");
      block.className = "ced-block";
      block.style.animationDelay = `${i * 9}ms`;
      cedFullBlocks.appendChild(block);
    }
    for (let i = 0; i < 40; i += 1) {
      const block = document.createElement("div");
      block.className = `ced-block ${i < 20 ? "enc" : "dec skipped"}`;
      block.style.animationDelay = `${i * 9}ms`;
      cedCedBlocks.appendChild(block);
    }
  }
  const updateCed = () => {
    if (!cedSlider) return;
    const exp = Number(cedSlider.value);
    const tokens = 2 ** exp;
    const full = 40 * tokens;
    const ced = 20 * tokens + 20 * 128;
    $("#ced-length-out").textContent = exp >= 20 ? "1M" : compact(tokens);
    $("#ced-full-cost").textContent = compact(full);
    $("#ced-ced-cost").textContent = compact(ced);
    $("#ced-ratio").textContent = `${((ced / full) * 100).toFixed(1)}%`;
  };
  cedSlider?.addEventListener("input", updateCed);
  updateCed();

  // CSA2 modes
  const csaModes = {
    full: {
      title: "Full Mode",
      desc: "当前层生成自己的 Main KV 与 Indexer K，运行完整索引器，产出全新的 Top-K。所有组件都由当前层负责。",
      states: {
        mainq: "computed", indexq: "computed", swa: "computed",
        mainkv: "computed", indexkv: "computed", topk: "computed",
        selected: "computed", output: "computed"
      },
      share: "1 / 4–6 层",
      index: "每层都算",
      status: "FULL · 生成 KV + 索引 + Top-K"
    },
    reindex: {
      title: "Reindex Mode",
      desc: "复用最近的 Main KV 与 Indexer K，但用自己的 Indexer Q 重新打分，选出新的 Top-K。缓存共享，选择不共享。",
      states: {
        mainq: "computed", indexq: "computed", swa: "computed",
        mainkv: "shared", indexkv: "shared", topk: "computed",
        selected: "computed", output: "computed"
      },
      share: "1 / 4 层",
      index: "池内重算",
      status: "REINDEX · 复用 KV + 重选 Top-K"
    },
    reuse: {
      title: "Reuse Mode",
      desc: "直接复用最近的 Main KV 与 Top-K 索引，不再运行索引器。仍然计算自己的 Main Q 与 SWA KV，再执行稀疏注意力。",
      states: {
        mainq: "computed", indexq: "skipped", swa: "computed",
        mainkv: "shared", indexkv: "shared", topk: "index-reused",
        selected: "computed", output: "computed"
      },
      share: "1 / 4 层",
      index: "0 次",
      status: "REUSE · 复用 KV + 直接使用 Top-K"
    },
    swa: {
      title: "SWA-only Layer",
      desc: "前两层不进入 CSA2 路径，只做 128 token 的滑动窗口注意力。它们是 CED 省掉 Decoder 全局 KV 计算时仍要保留的局部状态。",
      states: {
        mainq: "skipped", indexq: "skipped", swa: "computed",
        mainkv: "skipped", indexkv: "skipped", topk: "skipped",
        selected: "skipped", output: "computed"
      },
      share: "不参与",
      index: "0 次",
      status: "SWA · 仅局部窗口，不建立全局 KV"
    }
  };

  const setCsaMode = (mode, updateTab = true) => {
    const data = csaModes[mode];
    if (!data) return;
    if (updateTab) {
      $$(".mode-tab").forEach((tab) => {
        const active = mode !== "swa" && tab.dataset.mode === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
    }
    $("#csa2-mode-title").textContent = data.title;
    $("#csa2-mode-desc").textContent = data.desc;
    $("#csa2-share").textContent = data.share;
    $("#csa2-index-cost").textContent = data.index;
    $("#csa2-status").textContent = data.status;
    $$(".flow-node").forEach((node) => {
      node.classList.remove("is-computed", "is-shared", "is-index-reused", "is-skipped");
      const state = data.states[node.dataset.node];
      if (state) node.classList.add(`is-${state}`);
    });
  };
  $$(".mode-tab").forEach((tab) => tab.addEventListener("click", () => setCsaMode(tab.dataset.mode)));
  setCsaMode("full", false);

  // Hierarchical indexer
  const indexerCanvas = $("#indexer-canvas");
  const indexerState = {
    width: 0, height: 0, dpr: 1, stage: 0, lastStage: -1, timer: 0, visible: true,
    contextExp: 20,
    blocks: [],
    topk: new Set(),
    pool: new Set(),
    stageStart: performance.now()
  };
  if (indexerCanvas) {
    setupCanvas(indexerCanvas, indexerState);
    const cols = 48;
    const rows = 18;
    const blockCols = 8;
    const blockRows = 3;
    let seed = 17;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let by = 0; by < rows; by += blockRows) {
      for (let bx = 0; bx < cols; bx += blockCols) {
        const block = { bx, by, score: rnd(), selected: false, cells: [] };
        for (let y = by; y < Math.min(rows, by + blockRows); y += 1) {
          for (let x = bx; x < Math.min(cols, bx + blockCols); x += 1) {
            block.cells.push({ x, y, score: rnd() });
          }
        }
        indexerState.blocks.push(block);
      }
    }
    const sortedBlocks = [...indexerState.blocks].sort((a, b) => b.score - a.score);
    sortedBlocks.slice(0, Math.round(sortedBlocks.length * 0.43)).forEach((block) => {
      block.selected = true;
      block.cells.forEach((cell) => indexerState.pool.add(`${cell.x},${cell.y}`));
    });
    indexerState.blocks.forEach((block) => {
      block.cells.sort((a, b) => b.score - a.score).slice(0, 4).forEach((cell) => indexerState.topk.add(`${cell.x},${cell.y}`));
    });
    const indexerObserver = new IntersectionObserver((entries) => {
      indexerState.visible = entries[0].isIntersecting;
    }, { threshold: 0 });
    indexerObserver.observe(indexerCanvas);

    const drawIndexer = (ts) => {
      if (!indexerState.width) { requestAnimationFrame(drawIndexer); return; }
      const ctx = indexerCanvas.getContext("2d");
      const dpr = indexerState.dpr;
      const w = indexerState.width;
      const h = indexerState.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const elapsed = ts - indexerState.stageStart;
      const stageDuration = 2600;
      if (elapsed > stageDuration) {
        indexerState.stage = (indexerState.stage + 1) % 3;
        indexerState.stageStart = ts;
        $$(".indexer-step").forEach((el) => el.classList.toggle("active", Number(el.dataset.step) === indexerState.stage));
      }
      const stage = indexerState.stage;
      const stageT = clamp((ts - indexerState.stageStart) / stageDuration, 0, 1);

      const padX = 34;
      const padTop = 76;
      const padBottom = 34;
      const cellW = (w - padX * 2) / 48;
      const cellH = (h - padTop - padBottom) / 18;
      const cell = Math.min(cellW, cellH) * 0.72;
      const gridW = cellW * 48;
      const gridH = cellH * 18;
      const startX = (w - gridW) / 2;
      const startY = padTop + (h - padTop - padBottom - gridH) / 2;

      ctx.fillStyle = "rgba(5, 9, 16, 0.3)";
      ctx.fillRect(0, 0, w, h);

      indexerState.blocks.forEach((block) => {
        if (block.selected && stage >= 1) {
          const x = startX + block.bx * cellW - 2;
          const y = startY + block.by * cellH - 2;
          const width = Math.min(blockCols, 48 - block.bx) * cellW + 3;
          const height = Math.min(blockRows, 18 - block.by) * cellH + 3;
          ctx.fillStyle = `rgba(80, 108, 210, ${stage === 1 ? 0.12 + stageT * 0.08 : 0.12})`;
          ctx.strokeStyle = `rgba(111, 140, 255, ${stage === 1 ? 0.4 : 0.25})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x, y, width, height, 4);
          ctx.fill();
          ctx.stroke();
        }
      });

      for (let y = 0; y < 18; y += 1) {
        for (let x = 0; x < 48; x += 1) {
          const key = `${x},${y}`;
          const px = startX + x * cellW + (cellW - cell) / 2;
          const py = startY + y * cellH + (cellH - cell) / 2;
          let alpha = 0.065;
          let color = "150, 166, 196";
          if (stage === 0) {
            const scanX = stageT * 48;
            if (x < scanX) alpha = 0.15;
            if (indexerState.topk.has(key) && x < scanX) {
              color = "100, 229, 194";
              alpha = 0.75;
            }
          } else if (stage === 1) {
            if (indexerState.pool.has(key)) {
              color = "111, 140, 255";
              alpha = 0.28;
            }
            if (indexerState.topk.has(key)) {
              color = "100, 229, 194";
              alpha = 0.68;
            }
          } else {
            if (indexerState.pool.has(key)) {
              color = "111, 140, 255";
              alpha = 0.32;
            }
            if (indexerState.topk.has(key)) {
              const pulse = 0.55 + 0.2 * Math.sin(ts / 220 + x * 0.2);
              color = "100, 229, 194";
              alpha = pulse;
            }
          }
          ctx.fillStyle = `rgba(${color}, ${alpha})`;
          ctx.beginPath();
          ctx.roundRect(px, py, cell, cell, 1.4);
          ctx.fill();
        }
      }

      if (stage === 0) {
        const scanX = startX + stageT * gridW;
        ctx.fillStyle = "rgba(100, 229, 194, 0.8)";
        ctx.fillRect(scanX, startY - 8, 1, gridH + 16);
        ctx.fillStyle = "rgba(100, 229, 194, 0.1)";
        ctx.fillRect(startX, startY - 8, scanX - startX, gridH + 16);
      }

      const labels = ["FULL LAYER · SCAN ALL", "BUILD CANDIDATE POOL", "REINDEX · SEARCH POOL ONLY"];
      $("#indexer-stage").textContent = labels[stage];
      const exp = indexerState.contextExp;
      const count = stage === 0 ? 2 ** exp : 16384;
      $("#indexer-scan-count").textContent = fmt(count);
      $("#indexer-full-scan").textContent = compact(2 ** exp);
      $("#indexer-ratio").textContent = `${((16384 / 2 ** exp) * 100).toFixed(1)}%`;

      if (indexerState.visible) requestAnimationFrame(drawIndexer);
      else setTimeout(() => requestAnimationFrame(drawIndexer), 500);
    };
    requestAnimationFrame(drawIndexer);
    $$(".indexer-step").forEach((step) => {
      step.addEventListener("click", () => {
        indexerState.stage = Number(step.dataset.step);
        indexerState.stageStart = performance.now();
        $$(".indexer-step").forEach((el) => el.classList.toggle("active", el === step));
      });
    });
    $("#indexer-context")?.addEventListener("input", (event) => {
      indexerState.contextExp = Number(event.target.value);
      $("#indexer-context-out").textContent = indexerState.contextExp >= 20 ? "1M" : compact(2 ** indexerState.contextExp);
    });
  }

  // KV calculator
  const kvSlider = $("#kv-context");
  const updateKv = () => {
    if (!kvSlider) return;
    const tokens = 2 ** Number(kvSlider.value);
    const v4 = tokens * 3560 / 1e9;
    const v41 = tokens * 890 / 1e9;
    $("#kv-context-out").textContent = `${fmt(tokens)} tokens`;
    $("#calc-v4").textContent = `${v4.toFixed(2)} GB`;
    $("#calc-v41").textContent = `${v41.toFixed(2)} GB`;
    $("#calc-persistent").textContent = `${v41.toFixed(2)} GB / 请求`;
    $("#calc-batch").textContent = `${(v41 * 100).toFixed(1)} GB vs ${(v4 * 100).toFixed(1)} GB`;
  };
  kvSlider?.addEventListener("input", updateKv);
  updateKv();

  // MoE
  const moeCanvas = $("#moe-canvas");
  const moeState = { width: 0, height: 0, dpr: 1, selected: [], modality: "text", seed: 3, time: 0, visible: true };
  if (moeCanvas) {
    setupCanvas(moeCanvas, moeState);
    const expertCount = 384;
    const route = () => {
      moeState.seed += 1;
      const chosen = [];
      let s = moeState.seed * 7919 + (moeState.modality === "image" ? 401 : 17);
      while (chosen.length < 6) {
        s = (s * 1103515245 + 12345) % 2147483648;
        const idx = s % expertCount;
        if (!chosen.includes(idx)) chosen.push(idx);
      }
      moeState.selected = chosen;
      $("#moe-routing").textContent = `shared + ${chosen.map((n) => String(n).padStart(3, "0")).join(" · ")}`;
    };
    route();
    const moeObserver = new IntersectionObserver((entries) => {
      moeState.visible = entries[0].isIntersecting;
    }, { threshold: 0 });
    moeObserver.observe(moeCanvas);

    const drawMoe = (ts) => {
      if (!moeState.width) { requestAnimationFrame(drawMoe); return; }
      const ctx = moeCanvas.getContext("2d");
      const dpr = moeState.dpr;
      const w = moeState.width;
      const h = moeState.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cols = 24;
      const rows = 16;
      const padX = 34;
      const padTop = 52;
      const padBottom = 34;
      const gapX = (w - padX * 2) / (cols - 1);
      const gapY = (h - padTop - padBottom) / (rows - 1);
      const tokenX = w / 2;
      const tokenY = h - 22;
      const sharedX = padX - 14;
      const sharedY = padTop - 28;

      ctx.strokeStyle = "rgba(111, 140, 255, 0.1)";
      ctx.lineWidth = 1;
      moeState.selected.forEach((idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const x = padX + c * gapX;
        const y = padTop + r * gapY;
        ctx.beginPath();
        ctx.moveTo(tokenX, tokenY);
        ctx.quadraticCurveTo((x + tokenX) / 2, (y + tokenY) / 2 + 16, x, y);
        ctx.strokeStyle = moeState.modality === "image" ? "rgba(242, 193, 92, 0.2)" : "rgba(81, 212, 232, 0.18)";
        ctx.stroke();
      });

      for (let i = 0; i < expertCount; i += 1) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = padX + c * gapX;
        const y = padTop + r * gapY;
        const active = moeState.selected.includes(i);
        ctx.beginPath();
        ctx.arc(x, y, active ? 4 : 2.1, 0, Math.PI * 2);
        if (active) {
          ctx.fillStyle = moeState.modality === "image" ? "#f2c15c" : "#64e5c2";
          ctx.shadowBlur = 15;
          ctx.shadowColor = moeState.modality === "image" ? "rgba(242,193,92,0.85)" : "rgba(100,229,194,0.85)";
        } else {
          ctx.fillStyle = "rgba(104, 120, 150, 0.34)";
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(sharedX, sharedY, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(111, 140, 255, 0.85)";
      ctx.shadowBlur = 18;
      ctx.shadowColor = "rgba(111,140,255,0.9)";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(155, 176, 255, 0.75)";
      ctx.font = "600 7px " + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = "left";
      ctx.fillText("SHARED", sharedX + 12, sharedY + 3);

      const pulse = 3.5 + Math.sin(ts / 260) * 0.7;
      ctx.beginPath();
      ctx.arc(tokenX, tokenY, pulse, 0, Math.PI * 2);
      ctx.fillStyle = moeState.modality === "image" ? "#f2c15c" : "#8fe9d3";
      ctx.shadowBlur = 16;
      ctx.shadowColor = "rgba(100,229,194,0.8)";
      ctx.fill();
      ctx.shadowBlur = 0;

      if (moeState.visible) requestAnimationFrame(drawMoe);
      else setTimeout(() => requestAnimationFrame(drawMoe), 500);
    };
    requestAnimationFrame(drawMoe);
    $("#moe-route")?.addEventListener("click", route);
    $$(".moe-controls .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".moe-controls .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        moeState.modality = btn.dataset.modality;
        $("#moe-token-label").textContent = moeState.modality === "image" ? "IMAGE TOKEN" : "TEXT TOKEN";
        route();
      });
    });
  }

  // Engram hashing
  const engramInput = $("#engram-input");
  const hash32 = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const renderEngram = () => {
    if (!engramInput) return;
    const text = engramInput.value.trim() || "DeepSeek";
    $("#engram-token").textContent = text;
    const parts = text.toLowerCase().split(/\s+/).filter(Boolean);
    const root = $("#engram-buckets");
    root.innerHTML = "";
    for (let head = 0; head < 8; head += 1) {
      const n = 2 + (head % 3);
      let gram = parts.join("");
      if (parts.length >= 2) {
        const start = (head + n) % Math.max(1, parts.length - 1);
        gram = parts.slice(start, start + n).join(" ");
      }
      if (!gram) gram = text.slice(0, n);
      const bucket = hash32(`${head}:${gram}`).toString(16).padStart(8, "0").slice(0, 6);
      const el = document.createElement("div");
      el.className = "engram-bucket";
      el.style.animationDelay = `${head * 25}ms`;
      el.innerHTML = `<span>h${head} · n=${n}</span><strong>${bucket}</strong>`;
      root.appendChild(el);
    }
  };
  engramInput?.addEventListener("input", renderEngram);
  renderEngram();

  // DSpark
  const draftWords = ["因为", "先", "构造", "反例", "验证"];
  const draftConf = [0.98, 0.94, 0.87, 0.73, 0.61];
  const dsparkState = { accepted: 0, verify: 4, load: 45 };
  const renderDspark = () => {
    const stream = $("#draft-stream");
    if (!stream) return;
    stream.innerHTML = "";
    draftWords.forEach((word, i) => {
      const el = document.createElement("div");
      const accepted = i < dsparkState.accepted;
      const rejected = i < dsparkState.verify && !accepted;
      const pending = i >= dsparkState.verify;
      el.className = `draft-item ${accepted ? "accepted" : rejected ? "rejected" : pending ? "pending" : ""}`;
      el.innerHTML = `
        <span class="draft-idx">D${i + 1}</span>
        <div class="draft-token">${word}</div>
        <div class="conf-track"><i style="--conf:${draftConf[i] * 100}%"></i></div>
        <span class="conf-val">${draftConf[i].toFixed(2)}</span>
      `;
      stream.appendChild(el);
    });
    $("#dspark-verify").textContent = String(dsparkState.verify);
    $("#dspark-verify-bar").style.width = `${(dsparkState.verify / 5) * 100}%`;
  };
  const updateDsparkLoad = () => {
    const load = Number($("#dspark-load").value);
    dsparkState.load = load;
    dsparkState.verify = clamp(5 - Math.floor(load / 24), 2, 5);
    dsparkState.accepted = 0;
    $("#dspark-load-out").textContent = load < 30 ? "低" : load < 70 ? "中" : "高";
    renderDspark();
  };
  $("#dspark-load")?.addEventListener("input", updateDsparkLoad);
  $("#dspark-run")?.addEventListener("click", () => {
    const threshold = 0.58 + dsparkState.load * 0.0023;
    let accepted = 0;
    for (let i = 0; i < dsparkState.verify; i += 1) {
      if (draftConf[i] >= threshold) accepted += 1;
      else break;
    }
    dsparkState.accepted = Math.max(1, accepted);
    renderDspark();
  });
  updateDsparkLoad();
  setTimeout(() => {
    dsparkState.accepted = 3;
    renderDspark();
  }, 700);

  // Effort slider
  const effortSlider = $("#effort-slider");
  effortSlider?.addEventListener("input", () => {
    const value = Number(effortSlider.value);
    $("#effort-out").textContent = String(value);
    const ratio = value <= 25 ? 1 : value <= 50 ? 1.25 : value <= 75 ? 1.8 : 2.5;
    $(".effort-copy p").innerHTML = `训练时在系统提示里加入 <code>Reasoning Effort: 1–100</code>。当前档位约对应 <strong>${ratio.toFixed(2)}×</strong> 的输出 token 预算；同一题的不同 effort 分组内比较，长度惩罚随 effort 指数衰减。`;
  });

  // Ensure canvases redraw after fonts/layout settle
  window.addEventListener("load", () => {
    window.dispatchEvent(new Event("resize"));
    document.documentElement.dataset.ready = "true";
    window.__ATLAS_READY__ = true;
  });

  // Debug/QA hooks
  window.__atlasDebug = {
    selectLayer,
    setPhase: (phase) => {
      atlasState.phase = phase;
      atlasPhaseLabel.textContent = phase.toUpperCase();
      atlasActiveParams.textContent = phase === "prefill" ? "8B" : "16B";
    },
    setCsaMode,
    layers
  };
})();

import {
  Application,
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { GarouForm, RealmLayer } from '@w20-vtt/core';
import type { FogBrushStroke, ProjectedMapToken } from '@w20-vtt/protocol';
import { useVttRoomStore } from '../store/useVttRoomStore';
import { FogOfWarLayer } from './FogOfWarLayer';
import {
  createGauntletSilhouetteFilter,
  createPenumbraWorldFilter,
} from './penumbraFilter';

const MAP_WIDTH_PX = 2400;
const MAP_HEIGHT_PX = 2400;
const GRID_CELL_PX = 70;
const HALF_CELL_SNAP_PX = 35;
const FEET_PER_CELL = 5;

const FORM_RING_COLORS: Record<GarouForm, number> = {
  homid: 0x94a3b8, // Slate silver
  glabro: 0xd97706, // Amber
  crinos: 0xdc2626, // Rage crimson
  hispo: 0x9333ea, // Primal violet
  lupus: 0x16a34a, // Forest emerald
};

interface TokenNode {
  root: Container;
  speakingAura: Graphics;
  ring: Graphics;
  avatar: Sprite;
  label: Text;
  realm: RealmLayer;
  ownerDiscordId: string;
  portraitUrl: string;
}

export class DualRealmCanvasController {
  private app = new Application();
  private destroyed = false;
  private initialized = false;
  private unsubscribers: Array<() => void> = [];

  private worldContainer = new Container();
  private mapBackgroundLayer = new Container();
  private gridGraphics = new Graphics();
  private physicalTokensLayer = new Container();
  private penumbraTokensLayer = new Container();
  private fogContainer = new Container();
  private fogLayer: FogOfWarLayer | null = null;
  private rulerGraphics = new Graphics();
  private fogCursorGraphics = new Graphics();
  private rulerLabel = new Text({
    text: '',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      fontWeight: 'bold',
      fill: 0xfef3c7,
      stroke: { color: 0x09090b, width: 4 },
    },
  });

  private tokenNodes = new Map<string, TokenNode>();
  private draggingTokenId: string | null = null;
  private isPanning = false;
  private lastPanPos = { x: 0, y: 0 };

  // Shift+drag distance ruler state
  private isMeasuring = false;
  private rulerStart = { x: 0, y: 0 };

  // Storyteller fog brush painting state
  private isPaintingFog = false;
  private lastFogPaintPos: { x: number; y: number } | null = null;
  private pendingFogOutbox: FogBrushStroke[] = [];
  private fogInFlight = false;
  private lastSyncedFogLen = 0;
  private lastSyncedFogTail: FogBrushStroke | null = null;

  private currentMapUrl: string | null = null;
  private currentRealmBlend = 0;
  private targetRealmBlend = 0;
  private elapsedSec = 0;
  private wheelListener: ((ev: WheelEvent) => void) | null = null;

  async mount(
    hostElement: HTMLElement,
    initialMapUrl?: string | null
  ): Promise<void> {
    await this.app.init({
      resizeTo: hostElement,
      backgroundColor: 0x090a0f,
      antialias: true,
      preference: 'webgl',
    });

    // Guard against React 19 StrictMode unmount occurring mid-init
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }

    this.initialized = true;
    hostElement.appendChild(this.app.canvas);

    // Scene Hierarchy
    this.fogLayer = new FogOfWarLayer(this.app, MAP_WIDTH_PX, MAP_HEIGHT_PX);
    this.fogContainer.addChild(this.fogLayer.sprite);
    this.rulerLabel.visible = false;
    this.rulerLabel.anchor.set(0, 1);

    this.worldContainer.addChild(
      this.mapBackgroundLayer,
      this.gridGraphics,
      this.physicalTokensLayer,
      this.penumbraTokensLayer,
      this.fogContainer,
      this.rulerGraphics,
      this.fogCursorGraphics,
      this.rulerLabel
    );
    this.app.stage.addChild(this.worldContainer);

    // Fix filterArea to viewport screen for high-FPS fullscreen shader execution
    const penumbraShader = createPenumbraWorldFilter();
    const silhouetteShader = createGauntletSilhouetteFilter();

    this.mapBackgroundLayer.filters = [penumbraShader.filter];
    this.mapBackgroundLayer.filterArea = this.app.screen;
    this.physicalTokensLayer.filters = [silhouetteShader.filter];

    this.drawTacticalGrid(MAP_WIDTH_PX, MAP_HEIGHT_PX, GRID_CELL_PX);

    const initialState = useVttRoomStore.getState();
    this.fogLayer.setViewerRole(initialState.viewerRole);
    this.syncFogFromStore(initialState.fogStrokes);

    const targetMapUrl =
      initialMapUrl !== undefined ? initialMapUrl : initialState.mapAssetUrl;
    if (targetMapUrl) {
      await this.setMapUrl(targetMapUrl);
    }

    if (this.destroyed) return;

    this.bindViewportInteractions();
    this.bindStoreSubscriptions();

    // 60fps Render & Shader Interpolation Ticker
    this.app.ticker.add((ticker) => {
      this.elapsedSec += ticker.deltaMS / 1000;

      // Smoothly transition Stepping Sideways shader blend (~400ms ease)
      const step = Math.min(1, ticker.deltaMS * 0.008);
      this.currentRealmBlend +=
        (this.targetRealmBlend - this.currentRealmBlend) * step;

      const state = useVttRoomStore.getState();
      const effectiveRealm =
        state.viewerRole === 'storyteller' &&
        state.storytellerPreviewRealm !== 'both'
          ? state.storytellerPreviewRealm
          : state.viewerRealm;

      this.targetRealmBlend = effectiveRealm === 'physical' ? 0.0 : 1.0;

      penumbraShader.setUniforms(
        this.currentRealmBlend,
        state.localGauntlet,
        this.elapsedSec
      );

      const showSilhouette =
        effectiveRealm !== 'physical' &&
        !(
          state.viewerRole === 'storyteller' &&
          state.storytellerPreviewRealm === 'both'
        );
      silhouetteShader.update(showSilhouette, this.elapsedSec);

      // Show or hide Penumbra layer when ST inspects Physical-only preview
      this.penumbraTokensLayer.visible = !(
        state.viewerRole === 'storyteller' &&
        state.storytellerPreviewRealm === 'physical'
      );

      // Pulse voice-reactive rings for active Discord speakers
      const pulseScale = 1 + 0.09 * Math.sin(this.elapsedSec * 9);
      for (const node of this.tokenNodes.values()) {
        const isSpeaking = state.speakingDiscordIds.has(node.ownerDiscordId);
        node.speakingAura.visible = isSpeaking;
        if (isSpeaking) {
          node.speakingAura.scale.set(pulseScale);
        }
      }
    });
  }

  async setMapUrl(url: string | null): Promise<void> {
    if (!this.initialized || this.destroyed) return;
    if (url === this.currentMapUrl) return;
    this.currentMapUrl = url;

    if (!url) {
      this.mapBackgroundLayer.removeChildren();
      return;
    }

    try {
      const tex = await Assets.load<Texture>(url);
      if (this.destroyed || this.currentMapUrl !== url) return;
      this.mapBackgroundLayer.removeChildren();
      const mapSprite = new Sprite(tex);
      this.mapBackgroundLayer.addChild(mapSprite);
    } catch (err) {
      console.warn('Failed to load tactical map texture:', url, err);
    }
  }

  private drawTacticalGrid(
    width: number,
    height: number,
    cellSizePx: number
  ): void {
    this.gridGraphics.clear();
    for (let x = 0; x <= width; x += cellSizePx) {
      this.gridGraphics.moveTo(x, 0).lineTo(x, height);
    }
    for (let y = 0; y <= height; y += cellSizePx) {
      this.gridGraphics.moveTo(0, y).lineTo(width, y);
    }
    this.gridGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
  }

  private bindStoreSubscriptions(): void {
    const syncTokens = () => {
      const { tokens, optimisticTokenCoords, characters } =
        useVttRoomStore.getState();
      this.reconcileTokens(tokens, optimisticTokenCoords, characters);
    };

    syncTokens();

    this.unsubscribers.push(
      useVttRoomStore.subscribe((s) => s.tokens, syncTokens),
      useVttRoomStore.subscribe((s) => s.optimisticTokenCoords, syncTokens),
      useVttRoomStore.subscribe((s) => s.characters, syncTokens),
      useVttRoomStore.subscribe(
        (s) => s.viewerRole,
        (role) => {
          this.fogLayer?.setViewerRole(role);
        }
      ),
      useVttRoomStore.subscribe(
        (s) => s.fogStrokes,
        (strokes) => {
          this.syncFogFromStore(strokes);
        }
      ),
      useVttRoomStore.subscribe(
        (s) => s.activeFogTool,
        (tool) => {
          if (!tool.active) {
            this.fogCursorGraphics.clear();
          }
        }
      ),
      useVttRoomStore.subscribe(
        (s) => s.lastSeq,
        () => {
          this.fogInFlight = false;
          this.flushNextFogStroke();
        }
      )
    );
  }

  private syncFogFromStore(strokes: FogBrushStroke[]): void {
    if (!this.fogLayer) return;

    if (strokes.length === 0) {
      this.fogLayer.shroudEntireMap();
      this.lastSyncedFogLen = 0;
      this.lastSyncedFogTail = null;
      return;
    }

    const canApplyDelta =
      strokes.length === this.lastSyncedFogLen + 1 &&
      (this.lastSyncedFogLen === 0 ||
        strokes[this.lastSyncedFogLen - 1] === this.lastSyncedFogTail);

    if (canApplyDelta) {
      this.fogLayer.applyStroke(strokes[strokes.length - 1]);
    } else {
      this.fogLayer.replayStrokes(strokes);
    }

    this.lastSyncedFogLen = strokes.length;
    this.lastSyncedFogTail = strokes[strokes.length - 1] ?? null;
  }

  private reconcileTokens(
    tokens: ProjectedMapToken[],
    optimisticCoords: Record<string, { x: number; y: number }>,
    characters: ReturnType<typeof useVttRoomStore.getState>['characters']
  ): void {
    const activeIds = new Set(tokens.map((t) => t.id));

    for (const [id, node] of this.tokenNodes.entries()) {
      if (!activeIds.has(id)) {
        node.root.destroy({ children: true });
        this.tokenNodes.delete(id);
      }
    }

    for (const token of tokens) {
      const charOwnerId = characters[token.characterId]?.ownerDiscordId ?? '';
      let node = this.tokenNodes.get(token.id);

      if (!node) {
        node = this.createTokenDisplayNode(token, charOwnerId);
        this.tokenNodes.set(token.id, node);
      } else if (token.portraitUrl !== node.portraitUrl) {
        node.portraitUrl = token.portraitUrl;
        this.loadTokenPortrait(node, token.portraitUrl);
      }

      const targetLayer =
        token.realm === 'physical'
          ? this.physicalTokensLayer
          : this.penumbraTokensLayer;
      if (node.root.parent !== targetLayer) {
        targetLayer.addChild(node.root);
      }

      const pos = optimisticCoords[token.id] ?? { x: token.x, y: token.y };
      node.root.position.set(pos.x, pos.y);
      node.root.alpha = token.isHidden ? 0.52 : 1.0;
      node.ownerDiscordId = charOwnerId;
      node.realm = token.realm;

      const ringColor = FORM_RING_COLORS[token.form] ?? 0x94a3b8;
      node.ring
        .clear()
        .circle(0, 0, 30)
        .stroke({ width: token.form === 'crinos' ? 4 : 3, color: ringColor });

      node.label.text = `${token.name} • ${token.woundBadge}`;
      node.label.alpha =
        token.visibilityMode === 'gauntlet_silhouette' ? 0.65 : 1.0;
    }
  }

  private loadTokenPortrait(node: TokenNode, portraitUrl: string): void {
    if (!portraitUrl) {
      node.avatar.texture = Texture.WHITE;
      return;
    }
    Assets.load<Texture>(portraitUrl)
      .then((tex) => {
        if (!this.destroyed && !node.avatar.destroyed && node.portraitUrl === portraitUrl) {
          node.avatar.texture = tex;
        }
      })
      .catch(() => {
        // Retain fallback placeholder if portrait image cannot be fetched
      });
  }

  private createTokenDisplayNode(
    token: ProjectedMapToken,
    ownerDiscordId: string
  ): TokenNode {
    const root = new Container();
    root.eventMode = 'static';
    root.cursor = 'grab';

    const speakingAura = new Graphics()
      .circle(0, 0, 37)
      .fill({ color: 0x22c55e, alpha: 0.22 })
      .stroke({ width: 2.5, color: 0x4ade80 });
    speakingAura.visible = false;

    const bgDisc = new Graphics().circle(0, 0, 29).fill(0x18181b);
    const avatar = new Sprite(Texture.WHITE);
    avatar.anchor.set(0.5);
    avatar.width = 56;
    avatar.height = 56;

    const maskCircle = new Graphics().circle(0, 0, 28).fill(0xffffff);
    avatar.mask = maskCircle;

    const ring = new Graphics();
    const label = new Text({
      text: token.name,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fill: 0xf4f4f5,
        stroke: { color: 0x09090b, width: 3 },
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 35);

    root.addChild(speakingAura, bgDisc, avatar, maskCircle, ring, label);

    const node: TokenNode = {
      root,
      speakingAura,
      ring,
      avatar,
      label,
      realm: token.realm,
      ownerDiscordId,
      portraitUrl: token.portraitUrl,
    };

    if (token.portraitUrl) {
      this.loadTokenPortrait(node, token.portraitUrl);
    }

    root.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return;
      // Allow Shift+drag distance ruler or active ST fog brush to pass through to stage
      const state = useVttRoomStore.getState();
      if (e.shiftKey) return;
      if (state.viewerRole === 'storyteller' && state.activeFogTool.active) {
        return;
      }

      const canControl =
        state.viewerRole === 'storyteller' ||
        state.activeCharacterId === token.characterId;
      if (!canControl) return;

      e.stopPropagation();
      this.draggingTokenId = token.id;
      root.cursor = 'grabbing';
    });

    return node;
  }

  private paintFogAt(localX: number, localY: number): void {
    const state = useVttRoomStore.getState();
    const tool = state.activeFogTool;
    if (state.viewerRole !== 'storyteller' || !tool.active) return;

    const stroke: FogBrushStroke = {
      mode: tool.mode,
      shape: tool.shape,
      x: Math.round(localX),
      y: Math.round(localY),
      radiusOrWidth: tool.radius,
      ...(tool.shape === 'rect' ? { height: tool.radius } : {}),
    };

    // Immediate zero-latency local stroke
    this.fogLayer?.applyStroke(stroke);
    this.lastFogPaintPos = { x: localX, y: localY };

    // Sequentialize WebSocket commands so fast drags never collide on expectedSeq
    this.pendingFogOutbox.push(stroke);
    this.flushNextFogStroke();
  }

  private flushNextFogStroke(): void {
    if (this.fogInFlight || this.pendingFogOutbox.length === 0) return;
    const state = useVttRoomStore.getState();
    if (state.connectionStatus !== 'authenticated') return;

    const nextStroke = this.pendingFogOutbox.shift();
    if (!nextStroke) return;

    this.fogInFlight = true;
    state.sendCommand({
      type: 'ST_FOG_STROKE',
      stroke: nextStroke,
    });
  }

  private drawFogBrushCursor(localX: number, localY: number): void {
    const state = useVttRoomStore.getState();
    const tool = state.activeFogTool;
    this.fogCursorGraphics.clear();
    if (state.viewerRole !== 'storyteller' || !tool.active) return;

    const color = tool.mode === 'reveal' ? 0xf59e0b : 0x6366f1;
    if (tool.shape === 'circle') {
      this.fogCursorGraphics
        .circle(localX, localY, tool.radius)
        .stroke({ width: 2, color, alpha: 0.85 });
    } else {
      this.fogCursorGraphics
        .rect(localX, localY, tool.radius, tool.radius)
        .stroke({ width: 2, color, alpha: 0.85 });
    }
  }

  private drawMeasurementRuler(endX: number, endY: number): void {
    const dx = endX - this.rulerStart.x;
    const dy = endY - this.rulerStart.y;
    const distPx = Math.hypot(dx, dy);
    const cells = distPx / GRID_CELL_PX;
    const feet = Math.round(cells * FEET_PER_CELL);
    const yards = (feet / 3).toFixed(1);

    this.rulerGraphics.clear();
    this.rulerGraphics
      .moveTo(this.rulerStart.x, this.rulerStart.y)
      .lineTo(endX, endY)
      .stroke({ width: 2.5, color: 0xfbbf24, alpha: 0.95 })
      .circle(this.rulerStart.x, this.rulerStart.y, 5)
      .fill({ color: 0xfbbf24, alpha: 1 })
      .circle(endX, endY, 5)
      .fill({ color: 0xfbbf24, alpha: 1 });

    this.rulerLabel.text = `${feet} ft (${yards} yds) • ${cells.toFixed(1)} sq`;
    this.rulerLabel.position.set(endX + 12, endY - 10);
    this.rulerLabel.visible = true;
  }

  private bindViewportInteractions(): void {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button === 1 || e.button === 2) {
        this.isPanning = true;
        this.lastPanPos = { x: e.global.x, y: e.global.y };
        return;
      }

      if (e.button === 0 && e.shiftKey) {
        const local = this.worldContainer.toLocal(e.global);
        this.isMeasuring = true;
        this.rulerStart = { x: local.x, y: local.y };
        this.drawMeasurementRuler(local.x, local.y);
        return;
      }

      if (e.button === 0) {
        const state = useVttRoomStore.getState();
        if (state.viewerRole === 'storyteller' && state.activeFogTool.active) {
          const local = this.worldContainer.toLocal(e.global);
          this.isPaintingFog = true;
          this.paintFogAt(local.x, local.y);
        }
      }
    });

    this.app.stage.on('pointermove', (e: FederatedPointerEvent) => {
      const local = this.worldContainer.toLocal(e.global);

      if (this.isMeasuring) {
        this.drawMeasurementRuler(local.x, local.y);
        return;
      }

      if (this.draggingTokenId) {
        useVttRoomStore
          .getState()
          .moveTokenOptimistic(this.draggingTokenId, local.x, local.y, false);
        return;
      }

      if (this.isPanning) {
        const dx = e.global.x - this.lastPanPos.x;
        const dy = e.global.y - this.lastPanPos.y;
        this.worldContainer.x += dx;
        this.worldContainer.y += dy;
        this.lastPanPos = { x: e.global.x, y: e.global.y };
        return;
      }

      this.drawFogBrushCursor(local.x, local.y);

      if (this.isPaintingFog) {
        const state = useVttRoomStore.getState();
        const minSpacing = Math.max(10, state.activeFogTool.radius * 0.25);
        const dist = this.lastFogPaintPos
          ? Math.hypot(
              local.x - this.lastFogPaintPos.x,
              local.y - this.lastFogPaintPos.y
            )
          : Infinity;
        if (dist >= minSpacing) {
          this.paintFogAt(local.x, local.y);
        }
      }
    });

    const finishPointerInteraction = (e: FederatedPointerEvent) => {
      if (this.draggingTokenId) {
        const local = this.worldContainer.toLocal(e.global);
        const snappedX =
          Math.round(local.x / HALF_CELL_SNAP_PX) * HALF_CELL_SNAP_PX;
        const snappedY =
          Math.round(local.y / HALF_CELL_SNAP_PX) * HALF_CELL_SNAP_PX;
        useVttRoomStore
          .getState()
          .moveTokenOptimistic(this.draggingTokenId, snappedX, snappedY, true);
        const node = this.tokenNodes.get(this.draggingTokenId);
        if (node) node.root.cursor = 'grab';
        this.draggingTokenId = null;
      }

      if (this.isMeasuring) {
        this.isMeasuring = false;
        this.rulerGraphics.clear();
        this.rulerLabel.visible = false;
      }

      this.isPaintingFog = false;
      this.lastFogPaintPos = null;
      this.isPanning = false;
    };

    this.app.stage.on('pointerup', finishPointerInteraction);
    this.app.stage.on('pointerupoutside', finishPointerInteraction);

    // Smooth cursor-centered zoom wheel
    this.wheelListener = (ev: WheelEvent) => {
      ev.preventDefault();
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.min(
        2.5,
        Math.max(0.35, this.worldContainer.scale.x * zoomFactor)
      );

      const rect = this.app.canvas.getBoundingClientRect();
      const pointerX = ev.clientX - rect.left;
      const pointerY = ev.clientY - rect.top;

      const worldPosBefore = {
        x: (pointerX - this.worldContainer.x) / this.worldContainer.scale.x,
        y: (pointerY - this.worldContainer.y) / this.worldContainer.scale.y,
      };

      this.worldContainer.scale.set(nextScale);
      this.worldContainer.x = pointerX - worldPosBefore.x * nextScale;
      this.worldContainer.y = pointerY - worldPosBefore.y * nextScale;
    };

    this.app.canvas.addEventListener('wheel', this.wheelListener, {
      passive: false,
    });
  }

  destroy(): void {
    this.destroyed = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.pendingFogOutbox = [];
    if (this.wheelListener && this.initialized && this.app.canvas) {
      this.app.canvas.removeEventListener('wheel', this.wheelListener);
      this.wheelListener = null;
    }
    this.fogLayer?.destroy();
    this.fogLayer = null;
    if (this.initialized && this.app.renderer) {
      this.app.destroy(true, { children: true });
    }
  }
}

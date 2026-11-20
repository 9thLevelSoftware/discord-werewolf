import { Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import type { FogBrushStroke, ParticipantRole } from '@w20-vtt/protocol';

export class FogOfWarLayer {
  public readonly sprite: Sprite;
  private renderTexture: RenderTexture;
  private brushWrapper = new Container();
  private brushGraphics = new Graphics();

  constructor(
    private app: Application,
    private mapWidth: number,
    private mapHeight: number
  ) {
    this.renderTexture = RenderTexture.create({
      width: mapWidth,
      height: mapHeight,
    });
    this.sprite = new Sprite(this.renderTexture);
    this.sprite.eventMode = 'none';
    this.brushWrapper.addChild(this.brushGraphics);

    // Start map completely shrouded in umbral darkness
    this.shroudEntireMap();
  }

  setViewerRole(role: ParticipantRole): void {
    // Storyteller sees translucent shroud over hidden rooms; Players see solid pitch black
    this.sprite.alpha = role === 'storyteller' ? 0.48 : 1.0;
  }

  applyStroke(stroke: FogBrushStroke): void {
    if (stroke.mode === 'reset_shroud_all') {
      this.shroudEntireMap();
      return;
    }
    if (stroke.mode === 'reset_reveal_all') {
      this.revealEntireMap();
      return;
    }

    this.brushGraphics.clear();
    // PixiJS v8 requirement: 'erase' sits on child Graphics inside wrapper Container
    this.brushGraphics.blendMode = stroke.mode === 'reveal' ? 'erase' : 'normal';

    if (stroke.shape === 'circle') {
      this.brushGraphics
        .circle(stroke.x, stroke.y, stroke.radiusOrWidth)
        .fill({ color: 0x050508, alpha: 1 });
    } else {
      this.brushGraphics
        .rect(
          stroke.x,
          stroke.y,
          stroke.radiusOrWidth,
          stroke.height ?? stroke.radiusOrWidth
        )
        .fill({ color: 0x050508, alpha: 1 });
    }

    this.app.renderer.render({
      container: this.brushWrapper,
      target: this.renderTexture,
      clear: false,
    });
  }

  replayStrokes(strokes: FogBrushStroke[]): void {
    if (strokes.length === 0) {
      this.shroudEntireMap();
      return;
    }

    let startIndex = 0;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (
        strokes[i].mode === 'reset_shroud_all' ||
        strokes[i].mode === 'reset_reveal_all'
      ) {
        startIndex = i;
        break;
      }
    }

    const first = strokes[startIndex];
    if (
      first.mode !== 'reset_shroud_all' &&
      first.mode !== 'reset_reveal_all'
    ) {
      this.shroudEntireMap();
    }

    for (let i = startIndex; i < strokes.length; i++) {
      this.applyStroke(strokes[i]);
    }
  }

  shroudEntireMap(): void {
    this.brushGraphics.clear();
    this.brushGraphics.blendMode = 'normal';
    this.brushGraphics
      .rect(0, 0, this.mapWidth, this.mapHeight)
      .fill({ color: 0x050508, alpha: 1 });

    this.app.renderer.render({
      container: this.brushWrapper,
      target: this.renderTexture,
      clear: true,
    });
  }

  revealEntireMap(): void {
    this.brushGraphics.clear();
    this.app.renderer.render({
      container: this.brushWrapper,
      target: this.renderTexture,
      clear: true,
    });
  }

  destroy(): void {
    this.sprite.destroy();
    this.renderTexture.destroy(true);
    this.brushWrapper.destroy({ children: true });
  }
}

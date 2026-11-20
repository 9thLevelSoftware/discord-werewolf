import { defaultFilterVert, Filter, GlProgram } from 'pixi.js';

const PENUMBRA_FRAGMENT_GLSL = /* glsl */ `
  in vec2 vTextureCoord;
  out vec4 finalColor;

  uniform sampler2D uTexture;
  uniform float uRealmBlend; // 0.0 = Physical, 1.0 = Penumbra
  uniform float uGauntlet;   // 1.0 (Caern) .. 10.0 (Weaver Lab)
  uniform float uTime;

  void main(void) {
    // Subtle spirit-wind UV ripple scaled by uRealmBlend
    vec2 ripple = vec2(
      sin(vTextureCoord.y * 28.0 + uTime * 1.6),
      cos(vTextureCoord.x * 24.0 - uTime * 1.3)
    ) * 0.0022 * uRealmBlend;

    vec2 uv = clamp(vTextureCoord + ripple, 0.0, 1.0);
    vec4 base = texture(uTexture, uv);

    if (uRealmBlend <= 0.001) {
      finalColor = base;
      return;
    }

    // Slight chromatic separation across spirit gossamer
    float rChan = texture(uTexture, clamp(uv + vec2(0.0018 * uRealmBlend, 0.0), 0.0, 1.0)).r;
    float bChan = texture(uTexture, clamp(uv - vec2(0.0018 * uRealmBlend, 0.0), 0.0, 1.0)).b;
    vec3 shiftedRgb = vec3(rChan, base.g, bChan);

    // Desaturate mundane hues and grade into Penumbral twilight indigo & bioluminescent teal
    float luma = dot(shiftedRgb, vec3(0.299, 0.587, 0.114));
    float highContrastLuma = smoothstep(0.08, 0.92, luma);
    vec3 spiritPalette = mix(
      vec3(0.05, 0.09, 0.22), // Deep Umbral shadow
      vec3(0.32, 0.78, 0.88), // Spirit-essence highlight
      highContrastLuma
    );

    // Higher Gauntlet ratings darken & constrict peripheral visibility
    float gauntletFactor = clamp(uGauntlet / 10.0, 0.1, 1.0);
    float distFromCenter = distance(vTextureCoord, vec2(0.5, 0.5));
    float vignette = 1.0 - smoothstep(0.35, 0.85 - (gauntletFactor * 0.22), distFromCenter);

    vec3 penumbraFinal = spiritPalette * mix(0.65, 1.05, vignette);
    vec3 blended = mix(base.rgb, penumbraFinal, uRealmBlend);

    finalColor = vec4(blended * base.a, base.a);
  }
`;

const SILHOUETTE_FRAGMENT_GLSL = /* glsl */ `
  in vec2 vTextureCoord;
  out vec4 finalColor;

  uniform sampler2D uTexture;
  uniform float uActive; // 1.0 when viewing Physical tokens from Penumbra
  uniform float uTime;

  void main(void) {
    vec4 tex = texture(uTexture, vTextureCoord);
    if (uActive <= 0.01 || tex.a <= 0.01) {
      finalColor = tex;
      return;
    }

    float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float scanFlicker = 0.82 + 0.18 * sin(vTextureCoord.y * 90.0 + uTime * 5.0);
    vec3 ghostTint = vec3(0.45, 0.72, 0.85) * (0.35 + luma * 0.65);
    float alpha = tex.a * 0.38 * scanFlicker;

    finalColor = vec4(ghostTint * alpha, alpha);
  }
`;

export interface PenumbraFilterHandle {
  filter: Filter;
  setUniforms: (realmBlend: number, gauntlet: number, elapsedSec: number) => void;
}

export function createPenumbraWorldFilter(): PenumbraFilterHandle {
  const filter = new Filter({
    glProgram: new GlProgram({
      vertex: defaultFilterVert,
      fragment: PENUMBRA_FRAGMENT_GLSL,
    }),
    resources: {
      penumbraUniforms: {
        uRealmBlend: { value: 0.0, type: 'f32' },
        uGauntlet: { value: 6.0, type: 'f32' },
        uTime: { value: 0.0, type: 'f32' },
      },
    },
  });

  return {
    filter,
    setUniforms: (realmBlend, gauntlet, elapsedSec) => {
      const uniforms = filter.resources.penumbraUniforms.uniforms as {
        uRealmBlend: number;
        uGauntlet: number;
        uTime: number;
      };
      uniforms.uRealmBlend = realmBlend;
      uniforms.uGauntlet = gauntlet;
      uniforms.uTime = elapsedSec;
    },
  };
}

export function createGauntletSilhouetteFilter(): {
  filter: Filter;
  update: (active: boolean, elapsedSec: number) => void;
} {
  const filter = new Filter({
    glProgram: new GlProgram({
      vertex: defaultFilterVert,
      fragment: SILHOUETTE_FRAGMENT_GLSL,
    }),
    resources: {
      silhouetteUniforms: {
        uActive: { value: 0.0, type: 'f32' },
        uTime: { value: 0.0, type: 'f32' },
      },
    },
  });

  return {
    filter,
    update: (active, elapsedSec) => {
      const uniforms = filter.resources.silhouetteUniforms.uniforms as {
        uActive: number;
        uTime: number;
      };
      uniforms.uActive = active ? 1.0 : 0.0;
      uniforms.uTime = elapsedSec;
    },
  };
}

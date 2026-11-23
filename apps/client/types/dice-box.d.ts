declare module '@3d-dice/dice-box' {
  export interface DiceBoxConfig {
    id?: string;
    container?: string | null;
    assetPath?: string;
    origin?: string;
    theme?: string;
    preloadThemes?: string[];
    externalThemes?: Record<string, string>;
    themeColor?: string;
    scale?: number;
    gravity?: number;
    throwForce?: number;
    spinForce?: number;
    lightIntensity?: number;
    enableShadows?: boolean;
    shadowTransparency?: number;
    delay?: number;
    /** Milliseconds a die may keep moving before it is frozen in place and read. Default 5000. */
    settleTimeout?: number;
    offscreen?: boolean;
    suspendSimulation?: boolean;
    autoResize?: boolean;
    canvasWidth?: number;
    canvasHeight?: number;
    onBeforeRoll?: (rolls: unknown) => void;
    onDieComplete?: (dieResult: unknown) => void;
    onRollComplete?: (results: unknown) => void;
    onRemoveComplete?: (dieResult: unknown) => void;
    onThemeLoaded?: (themeData: unknown) => void;
    onThemeConfigLoaded?: (themeData: unknown) => void;
  }

  export interface DiceRollNotationObject {
    qty: number;
    sides: number | string;
    theme?: string;
    themeColor?: string;
    modifier?: number;
  }

  export interface DiceRollOptions {
    theme?: string;
    themeColor?: string;
    newStartPoint?: boolean;
    seed?: string;
  }

  export default class DiceBox {
    constructor(config?: DiceBoxConfig);
    constructor(selector: string, config?: DiceBoxConfig);
    init(): Promise<this>;
    clear(): this;
    hide(hideClass?: string): this;
    show(): this;
    roll(
      notation: string | string[] | DiceRollNotationObject | DiceRollNotationObject[],
      options?: DiceRollOptions
    ): Promise<unknown>;
    add(
      notation: string | string[] | DiceRollNotationObject | DiceRollNotationObject[],
      options?: DiceRollOptions
    ): Promise<unknown>;
    updateConfig(options: Partial<DiceBoxConfig>): void;
  }
}

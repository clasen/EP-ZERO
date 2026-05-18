import type { EpZeroApi } from "../main/shared/types";

declare global {
  interface Window {
    epZero?: EpZeroApi;
  }
}

export {};

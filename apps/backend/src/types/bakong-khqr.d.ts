// bakong-khqr ships no types (plain CommonJS) - just what src/lib/bakong.ts
// uses.
declare module 'bakong-khqr' {
  export interface KhqrOptionalData {
    currency: number;
    amount: number;
    expirationTimestamp?: number;
    mobileNumber?: string;
  }

  export class IndividualInfo {
    constructor(bakongAccountId: string, merchantName: string, merchantCity: string, optionalData: KhqrOptionalData);
  }

  export interface KhqrGenerateResult {
    data?: { qr: string; md5: string } | null;
    status?: { code: number; errorCode?: number | null; message?: string | null };
  }

  export class BakongKHQR {
    generateIndividual(individualInfo: IndividualInfo): KhqrGenerateResult;
  }

  export const khqrData: {
    currency: { usd: number; khr: number };
  };
}

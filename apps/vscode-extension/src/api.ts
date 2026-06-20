import type {
  AdClickPayload,
  AdHistoryResponse,
  AdImpressionPayload,
  AdRequestPayload,
  AdRequestResponse,
  AuthProvider,
  AuthLoginResponse,
  CreditsValidationResponse,
  EstimateRequest,
  EstimateResponse,
  RequestHistoryResponse,
  SettingsResponse,
  SettingsUpdateRequest,
  SponsoredRequestPayload,
  SponsoredRequestResponse,
  WalletResponse
} from "@atacredits/shared";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export class AtaCreditsApiClient {
  constructor(private readonly getBaseUrl: () => string) {}

  private url(path: string): string {
    return `${this.getBaseUrl()}${path}`;
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`
    };
  }

  async login(email: string, provider: AuthProvider): Promise<AuthLoginResponse> {
    const response = await fetch(this.url("/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email,
        provider
      })
    });
    return parseResponse<AuthLoginResponse>(response);
  }

  async getWallet(token: string): Promise<WalletResponse> {
    const response = await fetch(this.url("/wallet"), {
      headers: this.authHeaders(token)
    });
    return parseResponse<WalletResponse>(response);
  }

  async getSettings(token: string): Promise<SettingsResponse> {
    const response = await fetch(this.url("/settings"), {
      headers: this.authHeaders(token)
    });
    return parseResponse<SettingsResponse>(response);
  }

  async updateSettings(
    token: string,
    payload: SettingsUpdateRequest
  ): Promise<SettingsResponse> {
    const response = await fetch(this.url("/settings"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseResponse<SettingsResponse>(response);
  }

  async requestAd(token: string, payload: AdRequestPayload): Promise<AdRequestResponse> {
    const response = await fetch(this.url("/ads/request"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseResponse<AdRequestResponse>(response);
  }

  async trackImpression(token: string, payload: AdImpressionPayload): Promise<void> {
    const response = await fetch(this.url("/ads/impression"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    await parseResponse(response);
  }

  async trackClick(token: string, payload: AdClickPayload): Promise<void> {
    const response = await fetch(this.url("/ads/click"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    await parseResponse(response);
  }

  async validateCredits(token: string): Promise<CreditsValidationResponse> {
    const response = await fetch(this.url("/credits/validate"), {
      method: "POST",
      headers: this.authHeaders(token)
    });
    return parseResponse<CreditsValidationResponse>(response);
  }

  async estimate(token: string, payload: EstimateRequest): Promise<EstimateResponse> {
    const response = await fetch(this.url("/ai/estimate"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseResponse<EstimateResponse>(response);
  }

  async sponsoredRequest(
    token: string,
    payload: SponsoredRequestPayload
  ): Promise<SponsoredRequestResponse> {
    const response = await fetch(this.url("/ai/sponsored-request"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseResponse<SponsoredRequestResponse>(response);
  }

  async logOfficialRequest(
    token: string,
    payload: {
      prompt: string;
      responseText: string;
      model: string;
      estimate: EstimateResponse;
    }
  ): Promise<void> {
    const response = await fetch(this.url("/ai/official-log"), {
      method: "POST",
      headers: {
        ...this.authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    await parseResponse(response);
  }

  async getRequestHistory(token: string): Promise<RequestHistoryResponse> {
    const response = await fetch(this.url("/history/requests"), {
      headers: this.authHeaders(token)
    });
    return parseResponse<RequestHistoryResponse>(response);
  }

  async getAdHistory(token: string): Promise<AdHistoryResponse> {
    const response = await fetch(this.url("/history/ads"), {
      headers: this.authHeaders(token)
    });
    return parseResponse<AdHistoryResponse>(response);
  }
}

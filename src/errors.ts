export class ValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = [message]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export class HttpRequestError extends Error {
  readonly url: string;
  readonly statusCode: number;
  readonly responseBody?: string;

  constructor(message: string, url: string, statusCode: number, responseBody?: string) {
    super(message);
    this.name = "HttpRequestError";
    this.url = url;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class UnsupportedGatewayError extends Error {
  constructor(bankCode: string) {
    super(`'${bankCode}' banka kodu için entegrasyon bulunamadı.`);
    this.name = "UnsupportedGatewayError";
  }
}

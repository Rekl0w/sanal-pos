import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ZodError } from "zod";

import { SanalPosClient } from "./client/sanalpos-client";
import {
  AdditionalInstallmentEnvelopeSchema,
  AllInstallmentEnvelopeSchema,
  BinEnvelopeSchema,
  CancelEnvelopeSchema,
  RefundEnvelopeSchema,
  Sale3DEnvelopeSchema,
  SaleQueryEnvelopeSchema,
  SaleRequestEnvelopeSchema,
} from "./domain/schemas";
import { ValidationError } from "./errors";
import { BankService } from "./services/bank-service";

const parseBooleanQuery = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
};

export const app = new Hono();

app.onError((error, c) => {
  if (error instanceof ValidationError) {
    return c.json(
      {
        ok: false,
        error: error.message,
        issues: error.issues,
      },
      400,
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        ok: false,
        error: "İstek doğrulanamadı",
        issues: error.issues.map((issue) => issue.message),
      },
      400,
    );
  }

  return c.json(
    {
      ok: false,
      error: error.message,
    },
    500,
  );
});

app.get("/", (c) =>
  c.json({
    name: "@rekl0w/sanal-pos",
    runtime: "node_or_bun",
    framework: "hono",
    endpoints: [
      "GET /health",
      "GET /api/banks",
      "GET /api/banks/:bankCode",
      "POST /api/sale",
      "POST /api/sale/3d-response",
      "POST /api/cancel",
      "POST /api/refund",
      "POST /api/query/bin",
      "POST /api/query/sale",
      "POST /api/query/installments/all",
      "POST /api/query/installments/additional",
    ],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    status: "healthy",
  }),
);

app.get("/api/banks", (c) => {
  const collective = parseBooleanQuery(c.req.query("collective_vpos"));
  const installmentApi = parseBooleanQuery(c.req.query("installment_api"));
  const supportsRefund = parseBooleanQuery(c.req.query("supports_refund"));

  const banks = SanalPosClient.allBankList((bank) => {
    if (collective !== undefined && bank.collective_vpos !== collective) {
      return false;
    }

    if (installmentApi !== undefined && bank.installment_api !== installmentApi) {
      return false;
    }

    if (supportsRefund !== undefined && bank.supports_refund !== supportsRefund) {
      return false;
    }

    return true;
  });

  return c.json({
    ok: true,
    count: banks.length,
    data: banks,
  });
});

app.get("/api/banks/:bankCode", (c) => {
  const bank = BankService.getBank(c.req.param("bankCode"));

  if (!bank) {
    return c.json(
      {
        ok: false,
        error: "Banka bulunamadı",
      },
      404,
    );
  }

  return c.json({ ok: true, data: bank });
});

app.post("/api/sale", zValidator("json", SaleRequestEnvelopeSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ ok: true, data: await SanalPosClient.sale(body.request, body.auth) });
});

app.post("/api/sale/3d-response", zValidator("json", Sale3DEnvelopeSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ ok: true, data: await SanalPosClient.sale3DResponse(body.request, body.auth) });
});

app.post("/api/cancel", zValidator("json", CancelEnvelopeSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ ok: true, data: await SanalPosClient.cancel(body.request, body.auth) });
});

app.post("/api/refund", zValidator("json", RefundEnvelopeSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ ok: true, data: await SanalPosClient.refund(body.request, body.auth) });
});

app.post("/api/query/bin", zValidator("json", BinEnvelopeSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ ok: true, data: await SanalPosClient.binInstallmentQuery(body.request, body.auth) });
});

app.post("/api/query/sale", zValidator("json", SaleQueryEnvelopeSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json({ ok: true, data: await SanalPosClient.saleQuery(body.request, body.auth) });
});

app.post(
  "/api/query/installments/all",
  zValidator("json", AllInstallmentEnvelopeSchema),
  async (c) => {
    const body = c.req.valid("json");
    return c.json({ ok: true, data: await SanalPosClient.allInstallmentQuery(body.request, body.auth) });
  },
);

app.post(
  "/api/query/installments/additional",
  zValidator("json", AdditionalInstallmentEnvelopeSchema),
  async (c) => {
    const body = c.req.valid("json");
    return c.json({ ok: true, data: await SanalPosClient.additionalInstallmentQuery(body.request, body.auth) });
  },
);

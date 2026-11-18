import {
  DAYS,
  formatSchedule,
  isValidSchedule,
  parseScheduleChanges,
  type Schedule,
} from "./schedule.ts";

const SERVER_INFO = {
  name: "personal-dashboard-weekly-schedule",
  version: "1.0.0",
};

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

const TOOL_DEFINITIONS = [
  {
    name: "get_weekly_schedule",
    description:
      "Kullanıcının haftalık planını Pazartesi-Pazar, 06:00-24:00 aralığında oku. Bu plan haftalık tekrarlanır.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "update_weekly_schedule",
    description:
      "Haftalık planda yalnızca belirtilen gün ve saat aralıklarını ayarla. Plan haftalık tekrarlanır; saat aralığı başlangıç dahil, bitiş hariçtir. Yalnızca tam saatler 06:00-24:00 arasında kullanılabilir. Belirtilmeyen saatler değişmeden kalır. free=boş, busy=meşgul, unplanned=planlanmadı.",
    inputSchema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description:
            "Değiştirilecek saat aralıkları. Aynı gün ve saat birden fazla aralıkta yer almamalı.",
          items: {
            type: "object",
            properties: {
              day: { type: "string", enum: DAYS },
              startHour: {
                type: "integer",
                minimum: 6,
                maximum: 23,
                description:
                  "Dahil başlangıç saati; örneğin 9, 09:00 demektir.",
              },
              endHour: {
                type: "integer",
                minimum: 7,
                maximum: 24,
                description: "Hariç bitiş saati; 24, gün sonu demektir.",
              },
              status: { type: "string", enum: ["free", "busy", "unplanned"] },
            },
            required: ["day", "startHour", "endHour", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["changes"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

const JSON_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function rpcError(id: unknown, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } });
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function getConfiguration() {
  const apiKey = Deno.env.get("MCP_API_KEY");
  const userId = Deno.env.get("MCP_USER_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (
    !apiKey || apiKey.length < 32 || !userId || !supabaseUrl || !serviceRoleKey
  ) {
    throw new Error(
      "The weekly schedule MCP function is missing required secrets.",
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(userId)
  ) {
    throw new Error("MCP_USER_ID must be a Supabase user UUID.");
  }

  return { apiKey, userId, supabaseUrl, serviceRoleKey };
}

function supabaseHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function getWeeklySchedule(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<Schedule> {
  const url = new URL("/rest/v1/user_data", supabaseUrl);
  url.searchParams.set("select", "data");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: supabaseHeaders(serviceRoleKey),
  });
  if (!response.ok) {
    throw new Error(`Supabase schedule read failed (${response.status}).`);
  }

  const rows = await response.json();
  const schedule = Array.isArray(rows) ? rows[0]?.data?.schedule : undefined;
  if (!isValidSchedule(schedule)) {
    throw new Error(
      "Haftalık plan henüz Supabase hesabında yok veya kayıtlı biçimi geçersiz. Önce uygulamada hesabına giriş yap.",
    );
  }
  return schedule;
}

async function updateWeeklySchedule(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  changes: ReturnType<typeof parseScheduleChanges>,
): Promise<Schedule> {
  const url = new URL(
    "/rest/v1/rpc/apply_mcp_weekly_schedule_changes",
    supabaseUrl,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey),
    body: JSON.stringify({
      p_user_id: userId,
      p_changes: changes.map(({ dayIndex, startHour, endHour, status }) => ({
        dayIndex,
        startHour,
        endHour,
        status,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`Supabase schedule update failed (${response.status}).`);
  }

  const result: unknown = await response.json();
  if (!isValidSchedule(result)) {
    throw new Error(
      "Supabase güncelleme sonrası geçerli bir haftalık plan döndürmedi.",
    );
  }
  return result;
}

function toolResult(text: string, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

async function callTool(
  name: unknown,
  args: unknown,
  config: ReturnType<typeof getConfiguration>,
) {
  if (name === "get_weekly_schedule") {
    if (args && typeof args === "object" && Object.keys(args).length > 0) {
      return toolResult("Bu araç ek girdi kabul etmiyor.", true);
    }
    const schedule = await getWeeklySchedule(
      config.supabaseUrl,
      config.serviceRoleKey,
      config.userId,
    );
    return toolResult(
      `Haftalık plan (tekrarlanan, 06:00-24:00):\n${formatSchedule(schedule)}`,
    );
  }

  if (name === "update_weekly_schedule") {
    const changes = parseScheduleChanges(args);
    const schedule = await updateWeeklySchedule(
      config.supabaseUrl,
      config.serviceRoleKey,
      config.userId,
      changes,
    );
    return toolResult(
      `İstenen saat aralıkları kaydedildi. Güncel haftalık plan:\n${
        formatSchedule(schedule)
      }`,
    );
  }

  throw new TypeError("Bilinmeyen araç.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: "POST, OPTIONS" },
    });
  }

  let config: ReturnType<typeof getConfiguration>;
  try {
    config = getConfiguration();
  } catch {
    return new Response("MCP function is not configured.", {
      status: 503,
      headers: JSON_HEADERS,
    });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!safeEqual(suppliedKey, config.apiKey)) {
    return new Response("Unauthorized.", {
      status: 401,
      headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer" },
    });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) {
    return new Response("Request too large.", {
      status: 413,
      headers: JSON_HEADERS,
    });
  }

  let message: Record<string, unknown>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 64_000) {
      return new Response("Request too large.", {
        status: 413,
        headers: JSON_HEADERS,
      });
    }
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return rpcError(null, -32600, "Invalid Request");
    }
    message = parsed as Record<string, unknown>;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  if (message.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: JSON_HEADERS });
  }
  if (
    message.jsonrpc !== "2.0" || !("id" in message) ||
    typeof message.method !== "string"
  ) {
    return rpcError(message.id ?? null, -32600, "Invalid Request");
  }

  if (message.method === "initialize") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : {};
    const requestedVersion = params.protocolVersion;
    const protocolVersion = typeof requestedVersion === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
      ? requestedVersion
      : "2025-03-26";
    return jsonResponse({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Bu sunucu yalnızca kullanıcının haftalık planını okur ve belirtilen saat aralıklarını değiştirir. Değişiklikler haftalık tekrarlanır; yalnızca verilen aralıklar etkilenir.",
      },
    });
  }

  if (message.method === "ping") {
    return jsonResponse({ jsonrpc: "2.0", id: message.id, result: {} });
  }

  if (message.method === "tools/list") {
    return jsonResponse({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: TOOL_DEFINITIONS },
    });
  }

  if (message.method === "tools/call") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : {};
    try {
      const result = await callTool(params.name, params.arguments, config);
      return jsonResponse({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      const text = error instanceof Error
        ? error.message
        : "Araç çalıştırılamadı.";
      return jsonResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: toolResult(text, true),
      });
    }
  }

  return rpcError(message.id, -32601, "Method not found");
});

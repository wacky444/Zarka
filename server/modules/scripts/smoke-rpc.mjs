const baseUrl = process.env.NAKAMA_BASE_URL || "http://localhost:7460";
const serverKey = process.env.NAKAMA_SERVER_KEY || "defaultkey";
const deviceId = process.env.NAKAMA_DEVICE_ID || "zarka-test-device";

const basicAuth = Buffer.from(`${serverKey}:`).toString("base64");

const authResponse = await fetch(
  `${baseUrl}/v2/account/authenticate/device?create=true`,
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: deviceId }),
  },
);

if (!authResponse.ok) {
  const text = await authResponse.text();
  throw new Error(`Auth failed: ${authResponse.status} ${text}`);
}

const authJson = await authResponse.json();
const token = authJson.token;
if (!token) {
  throw new Error("Auth did not return a token");
}

const rpcHeaders = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const createMatchPayload = JSON.stringify({ size: 2 });
const createMatchResponse = await fetch(`${baseUrl}/v2/rpc/create_match`, {
  method: "POST",
  headers: rpcHeaders,
  body: JSON.stringify(createMatchPayload),
});

if (!createMatchResponse.ok) {
  const text = await createMatchResponse.text();
  throw new Error(`create_match failed: ${createMatchResponse.status} ${text}`);
}

const createMatchResponseBody = await createMatchResponse.json();
const createMatchResponsePayload =
  typeof createMatchResponseBody.payload === "string"
    ? JSON.parse(createMatchResponseBody.payload)
    : createMatchResponseBody;
const matchId = createMatchResponsePayload.match_id;
if (!matchId) {
  throw new Error("create_match did not return match_id");
}

const submitTurnPayload = JSON.stringify({
  match_id: matchId,
  move: { example: 1 },
});
const submitTurnResponse = await fetch(`${baseUrl}/v2/rpc/submit_turn`, {
  method: "POST",
  headers: rpcHeaders,
  body: JSON.stringify(submitTurnPayload),
});

if (!submitTurnResponse.ok) {
  const text = await submitTurnResponse.text();
  throw new Error(`submit_turn failed: ${submitTurnResponse.status} ${text}`);
}

const getStatePayload = JSON.stringify({ match_id: matchId });
const getStateResponse = await fetch(`${baseUrl}/v2/rpc/get_state`, {
  method: "POST",
  headers: rpcHeaders,
  body: JSON.stringify(getStatePayload),
});

if (!getStateResponse.ok) {
  const text = await getStateResponse.text();
  throw new Error(`get_state failed: ${getStateResponse.status} ${text}`);
}

const getStateResponseBody = await getStateResponse.json();
const statePayload =
  typeof getStateResponseBody.payload === "string"
    ? JSON.parse(getStateResponseBody.payload)
    : getStateResponseBody;
if (!statePayload.match) {
  throw new Error("get_state did not return match data");
}

const removeMatchPayload = JSON.stringify({ match_id: matchId });
const removeMatchResponse = await fetch(`${baseUrl}/v2/rpc/remove_match`, {
  method: "POST",
  headers: rpcHeaders,
  body: JSON.stringify(removeMatchPayload),
});

if (!removeMatchResponse.ok) {
  const text = await removeMatchResponse.text();
  throw new Error(`remove_match failed: ${removeMatchResponse.status} ${text}`);
}

console.log("Server RPC smoke test passed.");

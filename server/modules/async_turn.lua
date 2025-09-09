local nk = require("nakama")

local MATCH_COLLECTION = "async_turn_matches"
local TURN_COLLECTION = "async_turn_turns"
local MATCH_KEY_PREFIX = "match_"

-- Dedicated server owned user id for authoritative records. A zeroed UUID is a
-- conventional choice for 'system' ownership. Adjust if you have a configured server user.
local SERVER_USER_ID = "00000000-0000-0000-0000-000000000000"

local function create_match(_, payload)
	local data = {}
	if payload and payload ~= "" then
		local json = nk.json_decode(payload)
		data.size = json.size
	end
	data.size = data.size or 2
	local match_id = nk.uuid_v4()
	local record = { match_id = match_id, players = {}, size = data.size, created_at = os.time(), current_turn = 0 }
	nk.storage_write({
		{
			collection = MATCH_COLLECTION,
			key = MATCH_KEY_PREFIX .. match_id,
			user_id = SERVER_USER_ID,
			value = record,
			permission_read = 2,
			permission_write = 0,
		},
	})
	return nk.json_encode({ match_id = match_id, size = record.size })
end

local function submit_turn(context, payload)
	assert(context and context.user_id, "No user context")
	assert(payload and payload ~= "", "Missing payload")
	local json = nk.json_decode(payload)
	assert(json.match_id, "match_id required")
	local match_key = MATCH_KEY_PREFIX .. json.match_id
	local records = nk.storage_read({ { collection = MATCH_COLLECTION, key = match_key, user_id = SERVER_USER_ID } })
	assert(#records == 1, "Match not found")
	local match = records[1].value
	-- Add player if new
	local found = false
	for _, pid in ipairs(match.players) do
		if pid == context.user_id then
			found = true
			break
		end
	end
	if not found then
		table.insert(match.players, context.user_id)
	end
	-- Turn index increments
	match.current_turn = match.current_turn + 1
	local turn_record = {
		match_id = json.match_id,
		turn = match.current_turn,
		player = context.user_id,
		move = json.move,
		created_at = os.time(),
	}
	nk.storage_write({
		{
			collection = MATCH_COLLECTION,
			key = match_key,
			user_id = SERVER_USER_ID,
			value = match,
			permission_read = 2,
			permission_write = 0,
		},
		{
			collection = TURN_COLLECTION,
			key = match.current_turn .. ":" .. json.match_id,
			user_id = SERVER_USER_ID,
			value = turn_record,
			permission_read = 2,
			permission_write = 0,
		},
	})
	return nk.json_encode({ ok = true, turn = match.current_turn })
end

local function get_state(_, payload)
	if not payload or payload == "" then
		return nk.json_encode({ error = "missing_payload" })
	end
	local ok, json = pcall(nk.json_decode, payload)
	if not ok or type(json) ~= "table" then
		return nk.json_encode({ error = "bad_json" })
	end
	if not json.match_id or json.match_id == "" then
		return nk.json_encode({ error = "match_id_required" })
	end
	local match_key = MATCH_KEY_PREFIX .. json.match_id
	local records = nk.storage_read({ { collection = MATCH_COLLECTION, key = match_key, user_id = SERVER_USER_ID } })
	if #records == 0 then
		return nk.json_encode({ error = "not_found" })
	end
	local match = records[1].value
	-- Fetch last 50 turns
	local turns = {}
	local limit = 50
	for i = math.max(1, match.current_turn - limit + 1), match.current_turn do
		local t = nk.storage_read({
			{ collection = TURN_COLLECTION, key = i .. ":" .. json.match_id, user_id = SERVER_USER_ID },
		})
		if #t == 1 then
			table.insert(turns, t[1].value)
		end
	end
	return nk.json_encode({ match = match, turns = turns })
end

nk.register_rpc(create_match, "create_match")
nk.register_rpc(submit_turn, "submit_turn")
nk.register_rpc(get_state, "get_state")

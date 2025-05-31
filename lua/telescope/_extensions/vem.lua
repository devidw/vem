local pickers = require("telescope.pickers")
local finders = require("telescope.finders")
local actions = require("telescope.actions")
local action_state = require("telescope.actions.state")
local conf = require("telescope.config").values

-- Async search function, now top-level
local latest_prompt = ""
local last_search_term = nil
local last_results = nil
local function do_search(prompt, callback, config_path, repo_path)
  if prompt == "" then
    if callback then
      callback({})
    end
    return
  end

  print("Starting search with config: " .. config_path .. ", repo: " .. repo_path .. " and query: " .. prompt)
  vim.notify("Starting search with config: " .. config_path .. ", repo: " .. repo_path .. " and query: " .. prompt, vim.log.levels.INFO)

  latest_prompt = prompt
  local this_prompt = prompt
  local stdout = vim.loop.new_pipe(false)
  local handle
  local result = ""
  print("Spawning API call with args: " .. repo_path .. " " .. config_path .. " and " .. prompt)
  handle = vim.loop.spawn("sh", {
    args = {"-c", repo_path .. "/api.sh '" .. repo_path .. "' '" .. config_path .. "' '" .. prompt .. "'"},
    stdio = {nil, stdout, nil},
  }, function()
    stdout:close()
    handle:close()
    vim.schedule(function()
      if this_prompt ~= latest_prompt then
        print("Ignoring outdated result for: " .. this_prompt)
        vim.notify("Ignoring outdated result for: " .. this_prompt, vim.log.levels.WARN)
        return -- ignore outdated result
      end
      print("Received raw response: " .. result)
      local success, parsed = pcall(vim.fn.json_decode, result)
      if not success then
        print("Failed to parse API response: " .. result)
        vim.notify("Failed to parse API response: " .. result, vim.log.levels.ERROR)
        callback({})
        return
      end
      local entries = {}
      for _, item in ipairs(parsed) do
        if item.path then
          table.insert(entries, {path = item.path, distance = item.distance})
        end
      end
      -- Persist last search
      last_search_term = prompt
      last_results = entries
      print("Received " .. #entries .. " results for query: " .. prompt)
      vim.notify("Received " .. #entries .. " results for query: " .. prompt, vim.log.levels.INFO)
      callback(entries)
    end)
  end)
  stdout:read_start(function(err, data)
    assert(not err, err)
    if data then
      result = result .. data
    end
  end)
end

local M = {}

function M.search(opts)
  opts = opts or {}
  local repo_path = opts.repo_path
  local config_path = opts.config_path

  -- Use last search if available
  local results = last_results or {}
  local initial_prompt = last_search_term or ""
  local current_picker = nil

  pickers.new(vim.tbl_extend("force", opts, {default_text = initial_prompt}), {
    prompt_title = "vem",
    finder = finders.new_table {
      results = results,
      entry_maker = function(entry)
        return {
          value = entry,
          display = string.format("%s  [%.4f]", entry.path, entry.distance or 0),
          ordinal = entry.path,
        }
      end,
    },
    sorter = require('telescope.sorters').empty(),
    attach_mappings = function(prompt_bufnr, map)
      local action_set = require('telescope.actions.set')
      local action_state = require('telescope.actions.state')
      -- Override <CR> to perform the search or open the file
      map('i', '<CR>', function()
        local picker = action_state.get_current_picker(prompt_bufnr)
        local selection = action_state.get_selected_entry()
        local prompt = action_state.get_current_line()
        -- If there is a selection, open it; otherwise, search
        if selection and selection.value and selection.value.path and type(selection.value.path) == "string" and selection.value.path ~= "" then
          actions.close(prompt_bufnr)
          vim.cmd("edit " .. selection.value.path)
        else
          -- Run the async search
          local function update_results(new_results)
            results = new_results
            last_search_term = prompt
            last_results = new_results
            picker:refresh(finders.new_table {
              results = results,
              entry_maker = function(entry)
                return {
                  value = entry,
                  display = string.format("%s  [%.4f]", entry.path, entry.distance or 0),
                  ordinal = entry.path,
                }
              end,
            }, { reset_prompt = false })
          end
          do_search(prompt, update_results, config_path, repo_path)
        end
      end)
      return true
    end,
  }):find()
end

-- ⬇ Register AFTER defining the search function
return require("telescope").register_extension({
  exports = {
    search = M.search,
  },
})

local pickers = require("telescope.pickers")
local finders = require("telescope.finders")
local actions = require("telescope.actions")
local action_state = require("telescope.actions.state")
local conf = require("telescope.config").values
local previewers = require("telescope.previewers")

-- State variables
local latest_prompt = ""
local last_search_term = nil
local last_results = nil
local keyword_match_enabled = false

-- Async search function, now top-level
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
    args = {"-c", repo_path .. "/api.sh '" .. repo_path .. "' '" .. config_path .. "' '" .. prompt .. "' '" .. (keyword_match_enabled and "1" or "0") .. "'"},
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
          table.insert(entries, {
            path = item.path,
            distance = item.distance,
            content = item.content,
            collection_id = item.collection_id,
            id = item.id,
          })
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
          display = string.format("%s/%s", entry.collection_id or "", entry.id or ""),
          ordinal = entry.path,
        }
      end,
    },
    previewer = previewers.new_buffer_previewer({
      title = "Content Preview",
      define_preview = function(self, entry, status)
        if entry.value and entry.value.content then
          vim.api.nvim_buf_set_lines(self.state.bufnr, 0, -1, false, vim.split(entry.value.content, "\n"))
        end
      end,
    }),
    sorter = require('telescope.sorters').empty(),
    attach_mappings = function(prompt_bufnr, map)
      local action_set = require('telescope.actions.set')
      local action_state = require('telescope.actions.state')
      
      -- Add leader+k mapping to toggle keyword matching in both normal and insert modes
      local function toggle_keyword_match()
        keyword_match_enabled = not keyword_match_enabled
        vim.notify("Keyword matching " .. (keyword_match_enabled and "enabled" or "disabled"), vim.log.levels.INFO)
      end

      map('n', '<leader>k', toggle_keyword_match)

      -- Add Ctrl+Space mapping for rerunning search in both modes
      local function do_search_update()
        local picker = action_state.get_current_picker(prompt_bufnr)
        local prompt = action_state.get_current_line()
        -- Clear results immediately to show feedback
        results = {}
        picker:refresh(finders.new_table {
          results = results,
          entry_maker = function(entry)
            return {
              value = entry,
              display = string.format("%s/%s", entry.collection_id or "", entry.id or ""),
              ordinal = entry.path,
            }
          end,
        }, { reset_prompt = false })
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
                display = string.format("%s/%s", entry.collection_id or "", entry.id or ""),
                ordinal = entry.path,
              }
            end,
          }, { reset_prompt = false })
        end
        do_search(prompt, update_results, config_path, repo_path)
      end

      map('i', '<C-Space>', do_search_update)
      map('n', '<C-Space>', do_search_update)

      -- Override <CR> to only open files
      map('i', '<CR>', function()
        local selection = action_state.get_selected_entry()
        -- Only open if there is a valid selection
        if selection and selection.value and selection.value.path and type(selection.value.path) == "string" and selection.value.path ~= "" then
          actions.close(prompt_bufnr)
          vim.cmd("edit " .. selection.value.path)
        end
      end)
      return true
    end,
  }):find()

  -- Show initial state when entering picker
  vim.notify("Keyword matching " .. (keyword_match_enabled and "enabled" or "disabled"), vim.log.levels.INFO)
end

-- ⬇ Register AFTER defining the search function
return require("telescope").register_extension({
  exports = {
    search = M.search,
  },
})

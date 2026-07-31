# Bookmark in Sidebar

Sidebar bookmarks manager with folders, search, sorting, and quick actions.

[![License](https://img.shields.io/badge/license-GPLv2-red.svg)](https://www.gnu.org/licenses/gpl-2.0.html)
![Version](https://img.shields.io/badge/version-1.3-green.svg)

## Permissions

| Permission | Purpose |
|------------|---------|
| **sidePanel** | Display bookmarks in the browser sidebar |
| **bookmarks** | Read and modify bookmarks (create, rename, delete, move) |
| **storage** | Save collapsed folder states and sort modes |
| **tabs** | Get current tab URL to add bookmarks |

The extension does not collect, store, or transmit any user data. All data stays locally in your browser.

## Features

- Bookmarks in Sidebar – Access your bookmarks directly from the browser sidebar
- Folder Management – Create, rename, delete folders; collapse/expand nested folders
- Search – Search bookmarks by title or URL (min 3 characters)
- Sorting – Sort bookmarks within folders by: Chrome default, oldest, A-Z, Z-A
- Deduplicate – Remove duplicate bookmarks from current folder and all subfolders
- Dark Theme – Automatically adapts to system theme
- State Persistence – Collapsed folders and sort modes are saved in storage
- System Page Protection – Prevents adding chrome://, edge://, about:, file:// pages
- Bookmark Actions – Share, copy link, rename, delete

## Installation

### From Chrome Web Store (coming soon)

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome/Edge and go to chrome://extensions/ (or edge://extensions/)
3. Enable Developer mode (toggle in top-right)
4. Click Load unpacked
5. Select the extension folder

### Manage Bookmarks
- Click on a bookmark to open in new tab
- Right-click on a folder to access folder actions
- Hover over a bookmark to see action buttons (rename, share, copy, delete)

### Folder Actions
- Click on folder name to expand/collapse
- Right-click on folder to open context menu:
  - Create folder
  - Add bookmark (current tab)
  - Rename folder
  - Remove duplicates
  - Delete folder (non-system folders only)

### Search
- Type in search bar at the top
- Searches through bookmark titles and URLs
- Minimum 3 characters required

### Sorting
- Click the sort icon in any folder header
- Cycles through: Chrome default -> Oldest -> A-Z -> Z-A

### Building
No build step required – it's a plain HTML/CSS/JS extension.

### Key APIs Used
- chrome.sidePanel – Sidebar integration
- chrome.bookmarks – Bookmark management
- chrome.storage – State persistence
- chrome.tabs – Current tab access
- chrome.i18n – Localization

## Localization

Supported languages:
- English (en)
- Ukrainian (uk)

## Known Issues

- Favicons for local/internal pages may not load (gracefully falls back to default)
- File protocol (file://) bookmarks are not supported

## Known Issues

- Favicons for local/internal pages may not load (gracefully falls back to default)
- File protocol (file://) bookmarks are not supported

## License

This extention is licensed under the GPLv2 or later.

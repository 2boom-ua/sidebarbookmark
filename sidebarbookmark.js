// Sidebar Bookmarks - Chrome/Edge Extension
// Copyright 2boom, 2026

// Collapsed folders state
var collapsedFolders = {};
// Track currently editing bookmark id
var editingBookmarkId = null;
// Folder sort modes state
var folderSortModes = {};
var refreshDebounceTimer = null;
var cachedFolderIds = {};

function getMessage(key) {
    var result = chrome.i18n.getMessage(key);
    if (!result) {
        var fallback = {
            'searchPlaceholder': 'Search bookmarks...',
            'shareTooltip': 'Share link',
            'copyTooltip': 'Copy link',
            'deleteTooltip': 'Delete',
            'renameTooltip': 'Rename',
            'renameSuccess': 'Bookmark renamed',
            'loadingText': 'Loading bookmarks...',
            'nothingFound': 'Nothing found',
            'itemDeleted': 'Bookmark deleted',
            'copied': 'Copied!',
            'searchMinChars': 'Enter 3+ characters to search',
            'saveTooltip': 'Save',
            'cancelTooltip': 'Cancel',
            'bookmarkAdded': 'Bookmark added',
            'folderCreated': 'Folder created',
            'newFolderPlaceholder': 'Enter folder name...',
            'deleteFolderConfirm': 'Delete folder "{name}"?',
            'deleteFolderCancel': 'Cancel',
            'deleteFolderDelete': 'Delete',
            'folderDeleted': 'Folder deleted',
            'contextCreateFolder': 'Create folder',
            'contextAddBookmark': 'Add bookmark',
            'contextRenameFolder': 'Rename folder',
            'contextDeleteFolder': 'Delete folder'
        };
        return fallback[key] || key;
    }
    return result;
}

// Cached bookmark items
var cachedBookmarkItems = [];

// Filtered bookmark items
var filteredBookmarkItems = [];

// Function to load bookmarks into cache
function loadBookmarksToCache() {
    console.log('loadBookmarksToCache called');
    return new Promise(function(resolve, reject) {
        chrome.bookmarks.getTree(function(tree) {
            console.log('loadBookmarksToCache: got tree');
            if (chrome.runtime.lastError) {
                console.error('loadBookmarksToCache error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            
            // Extract all bookmarks from tree
            var allBookmarks = [];
            var folderIds = {};
            function traverse(nodes, path) {
                console.log('traverse: path:', path, 'nodes length:', nodes.length);
                nodes.forEach(function(node) {
                    console.log('traverse node:', node.id, node.title, 'url:', !!node.url, 'children:', !!node.children);
                    
                    // Store folder ID for all folders
                    if (node.children) {
                        var currentPath = path;
                        if (node.title && node.title !== '') {
                            var cleanTitle = node.title;
                            // If title contains slashes, use only the last part
                            if (cleanTitle.indexOf('/') !== -1) {
                                cleanTitle = cleanTitle.substring(cleanTitle.lastIndexOf('/') + 1);
                            }
                            currentPath = path ? path + '/' + cleanTitle : cleanTitle;
                        } else if (node.id === '1' || node.id === '2' || node.id === '3') {
                            var rootNames = {
                                '1': 'Favorites bar',
                                '2': 'Other bookmarks',
                                '3': 'Mobile favorites'
                            };
                            var rootName = rootNames[node.id];
                            currentPath = path ? path + '/' + rootName : rootName;
                        }
                        if (currentPath) {
                            folderIds[currentPath] = node.id;
                            console.log('  -> stored folder ID:', node.id, 'for path:', currentPath);
                        }
                    }
                    
                    if (node.url) {
                        node.folderPath = path;
                        allBookmarks.push(node);
                        console.log('  -> added bookmark:', node.title, 'url:', node.url);
                    }
                    
                    if (node.children) {
                        var newPath = path;
                        if (node.title && node.title !== '') {
                            var cleanTitle = node.title;
                            // If title contains slashes, use only the last part
                            if (cleanTitle.indexOf('/') !== -1) {
                                cleanTitle = cleanTitle.substring(cleanTitle.lastIndexOf('/') + 1);
                            }
                            newPath = path ? path + '/' + cleanTitle : cleanTitle;
                        } else if (node.id === '1' || node.id === '2' || node.id === '3') {
                            var rootNames = {
                                '1': 'Favorites bar',
                                '2': 'Other bookmarks',
                                '3': 'Mobile favorites'
                            };
                            var rootName = rootNames[node.id];
                            newPath = path ? path + '/' + rootName : rootName;
                        }
                        console.log('  -> traversing children with path:', newPath);
                        traverse(node.children, newPath);
                    }
                });
            }
            traverse(tree, '');
            console.log('traverse done');

            // Sort by dateAdded descending
            //allBookmarks.sort(function(a, b) {
            //    return b.dateAdded - a.dateAdded;
            //});

            console.log('loadBookmarksToCache: allBookmarks length:', allBookmarks.length);
            cachedBookmarkItems = allBookmarks;
            cachedFolderIds = folderIds;
            console.log('loadBookmarksToCache: folderIds:', Object.keys(folderIds));
            resolve(allBookmarks);
        });
    });
}

// Helper function to process bookmark items (filters + deduplication + sort)
function processBookmarkItems(items) {
    // Sort by dateAdded descending
    items.sort(function(a, b) {
        return b.dateAdded - a.dateAdded;
    });

    return items;
}

// Search bookmarks - search by title AND url from cache
function searchBookmarksAll(query) {
    return new Promise(function(resolve, reject) {
        var lowerQuery = query.toLowerCase();
        
        var items = cachedBookmarkItems.filter(function(item) {
            var titleMatch = item.title && item.title.toLowerCase().includes(lowerQuery);
            var urlMatch = item.url && item.url.toLowerCase().includes(lowerQuery);
            return titleMatch || urlMatch;
        });
        
        items = processBookmarkItems(items);
        resolve(items);
    });
}

// Show toast notification
function showToast(message) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(function() {
        toast.classList.remove('show');
    }, 2000);
}

// Position tooltip
function positionTooltip(element, tooltip) {
    var rect = element.getBoundingClientRect();
    var tooltipHeight = tooltip.offsetHeight || 30;
    var spaceBelow = window.innerHeight - rect.bottom;
    var spaceAbove = rect.top;
    
    // Reset positions
    tooltip.style.top = 'auto';
    tooltip.style.bottom = 'auto';
    tooltip.style.transform = 'translateX(-50%)';
    
    if (spaceBelow < tooltipHeight + 10 && spaceAbove > tooltipHeight + 10) {
        tooltip.style.bottom = '100%';
        tooltip.style.top = 'auto';
    } else {
        tooltip.style.top = '100%';
        tooltip.style.bottom = 'auto';
    }
    
    // Horizontal positioning
    var tooltipWidth = tooltip.offsetWidth || 100;
    var leftPos = rect.left + (rect.width / 2);
    var rightEdge = leftPos + (tooltipWidth / 2);
    var leftEdge = leftPos - (tooltipWidth / 2);
    
    if (rightEdge > window.innerWidth - 10) {
        var shift = rightEdge - window.innerWidth + 10;
        tooltip.style.transform = 'translateX(calc(-50% - ' + shift + 'px))';
    } else if (leftEdge < 10) {
        var shift = 10 - leftEdge;
        tooltip.style.transform = 'translateX(calc(-50% + ' + shift + 'px))';
    }
}

function createBookmarkItem(item) {
    var li = document.createElement('li');
    li.dataset.bookmarkUrl = item.url;
    li.dataset.bookmarkId = item.id;

    var title = item.title || item.url;

    // Favicon
    var faviconImg = document.createElement('img');
    faviconImg.className = 'favicon';
    try {
        var domain = new URL(item.url).hostname;
        faviconImg.src = 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=16';
        faviconImg.onerror = function() {
            this.src = 'https://icon.horse/icon/' + domain;
            this.onerror = function() {
                this.src = 'icons/favicon-default.svg';
            };
        };
    } catch (e) {
        faviconImg.src = 'icons/favicon-default.svg';
    }

    var linkContainer = document.createElement('span');
    linkContainer.className = 'link-container';
    var link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.textContent = title;
    linkContainer.appendChild(link);

    var actionButtons = document.createElement('span');
    actionButtons.className = 'action-buttons';
    
    // Rename button
    var renameBtn = document.createElement('button');
    renameBtn.className = 'action-btn';
    var renameIcon = document.createElement('img');
    renameIcon.src = 'icons/rename.svg';
    renameIcon.alt = 'Rename';
    renameBtn.appendChild(renameIcon);
    var renameTooltip = document.createElement('span');
    renameTooltip.className = 'tooltip';
    renameTooltip.textContent = getMessage('renameTooltip');
    renameBtn.appendChild(renameTooltip);
    renameBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        renameTooltip.classList.add('show');
    });
    renameBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        renameTooltip.classList.remove('show');
    });
    renameBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (editingBookmarkId !== null) {
            return;
        }
        var li = this.closest('li');
        var linkContainer = li.querySelector('.link-container');
        var actionButtons = li.querySelector('.action-buttons');
        var urlTooltip = li.querySelector('.url-tooltip');
        var oldTitle = item.title || item.url;
        
        document.querySelectorAll('li').forEach(function(otherLi) {
            if (otherLi !== li) {
                otherLi.classList.add('editing-disabled');
            }
        });
        
        var timeSpan = li.querySelector('.time');
        if (timeSpan) timeSpan.style.display = 'none';
        actionButtons.style.display = 'none';
        if (urlTooltip) urlTooltip.classList.remove('show');
        
        li.dataset.originalTitle = oldTitle;
        li.dataset.bookmarkId = item.id;
        
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-input';
        input.id = 'edit-' + Date.now();
        input.value = oldTitle;
        input.style.cssText = 'flex:1;min-width:0;padding:0 8px;height:26px;line-height:26px;border:2px solid var(--input-border);border-radius:4px;background:var(--search-bg);color:var(--search-text);font-size:13px;box-sizing:border-box;';
        input.style.outline = 'none';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        
        linkContainer.innerHTML = '';
        linkContainer.appendChild(input);
        
        var editButtons = document.createElement('span');
        editButtons.className = 'action-buttons';
        editButtons.style.display = 'flex';
        
        var saveBtn = document.createElement('button');
        saveBtn.className = 'action-btn';
        var saveIcon = document.createElement('img');
        saveIcon.src = 'icons/save.svg';
        saveIcon.alt = 'Save';
        saveBtn.appendChild(saveIcon);
        var saveTooltip = document.createElement('span');
        saveTooltip.className = 'tooltip';
        saveTooltip.textContent = getMessage('saveTooltip');
        saveBtn.appendChild(saveTooltip);
        saveBtn.addEventListener('mouseenter', function(e) {
            e.stopPropagation();
            saveTooltip.classList.add('show');
        });
        saveBtn.addEventListener('mouseleave', function(e) {
            e.stopPropagation();
            saveTooltip.classList.remove('show');
        });
        saveBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            saveEdit(li, input);
        });
        
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'action-btn';
        var cancelIcon = document.createElement('img');
        cancelIcon.src = 'icons/close.svg';
        cancelIcon.alt = 'Cancel';
        cancelBtn.appendChild(cancelIcon);
        var cancelTooltip = document.createElement('span');
        cancelTooltip.className = 'tooltip';
        cancelTooltip.textContent = getMessage('cancelTooltip');
        cancelBtn.appendChild(cancelTooltip);
        cancelBtn.addEventListener('mouseenter', function(e) {
            e.stopPropagation();
            cancelTooltip.classList.add('show');
        });
        cancelBtn.addEventListener('mouseleave', function(e) {
            e.stopPropagation();
            cancelTooltip.classList.remove('show');
        });
        cancelBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var currentLi = this.closest('li');
            if (currentLi) {
                cancelEdit(currentLi);
            }
        });

        editButtons.appendChild(saveBtn);
        editButtons.appendChild(cancelBtn);
        li.appendChild(editButtons);
        
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        
        editingBookmarkId = item.id;
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit(li, input);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit(li);
            }
        });
    });
    actionButtons.appendChild(renameBtn);

    // Share button
    var shareBtn = document.createElement('button');
    shareBtn.className = 'action-btn';
    var shareIcon = document.createElement('img');
    shareIcon.src = 'icons/share.svg';
    shareIcon.alt = 'Share';
    shareBtn.appendChild(shareIcon);
    var shareTooltip = document.createElement('span');
    shareTooltip.className = 'tooltip';
    shareTooltip.textContent = getMessage('shareTooltip');
    shareBtn.appendChild(shareTooltip);
    shareBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        shareTooltip.classList.add('show');
    });
    shareBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        shareTooltip.classList.remove('show');
    });
    shareBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (navigator.share) {
            navigator.share({
                title: title,
                url: item.url
            }).catch(function(err) {
                console.log('Share canceled:', err);
            });
        }
    });

    // Copy button
    var copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    var copyIcon = document.createElement('img');
    copyIcon.src = 'icons/copy.svg';
    copyIcon.alt = 'Copy';
    copyBtn.appendChild(copyIcon);
    var copyTooltip = document.createElement('span');
    copyTooltip.className = 'tooltip';
    copyTooltip.textContent = getMessage('copyTooltip');
    copyBtn.appendChild(copyTooltip);
    copyBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        copyTooltip.classList.add('show');
    });
    copyBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        copyTooltip.classList.remove('show');
    });
    copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        navigator.clipboard.writeText(item.url).then(function() {
            var originalText = copyTooltip.textContent;
            copyTooltip.textContent = getMessage('copied');
            setTimeout(function() {
                copyTooltip.textContent = originalText;
            }, 1000);
        });
    });

    // Delete button
    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn';
    var deleteIcon = document.createElement('img');
    deleteIcon.src = 'icons/delete.svg';
    deleteIcon.alt = 'Delete';
    deleteBtn.appendChild(deleteIcon);
    var deleteTooltip = document.createElement('span');
    deleteTooltip.className = 'tooltip';
    deleteTooltip.textContent = getMessage('deleteTooltip');
    deleteBtn.appendChild(deleteTooltip);
    deleteBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        deleteTooltip.classList.add('show');
    });
    deleteBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        deleteTooltip.classList.remove('show');
    });
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var bookmarkId = this.closest('li').dataset.bookmarkId;
        if (!bookmarkId) return;
        
        chrome.bookmarks.remove(bookmarkId, function() {
            if (chrome.runtime.lastError) {
                console.error('Failed to delete bookmark:', chrome.runtime.lastError);
                return;
            }
            showToast(getMessage('itemDeleted'));
            forceRefreshBookmarks();
        });
    });

    actionButtons.appendChild(shareBtn);
    actionButtons.appendChild(copyBtn);
    actionButtons.appendChild(deleteBtn);

    var urlTooltip = document.createElement('span');
    urlTooltip.className = 'url-tooltip';
    urlTooltip.textContent = item.url;
    li.appendChild(urlTooltip);

    var tooltipTimer = null;

    function showUrlTooltip() {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }
        positionTooltip(li, urlTooltip);
        urlTooltip.classList.add('show');
    }

    function hideUrlTooltip() {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }
        urlTooltip.classList.remove('show');
    }

    li.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        tooltipTimer = setTimeout(function() {
            showUrlTooltip();
        }, 400);
    });

    li.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        hideUrlTooltip();
    });

    actionButtons.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        hideUrlTooltip();
    });

    actionButtons.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        if (li.matches(':hover')) {
            showUrlTooltip();
        }
    });

    li.appendChild(faviconImg);
    li.appendChild(linkContainer);
    li.appendChild(actionButtons);
    
    li.addEventListener('click', function(e) {
        if (editingBookmarkId !== null) {
            return;
        }
        if (!e.target.closest('.action-btn') && !e.target.closest('a')) {
            var url = this.dataset.bookmarkUrl;
            if (url) {
                window.open(url, '_blank');
            }
        }
    });
    
    li.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    
    return li;
}

// Load sort modes from storage
function loadSortModes() {
    return new Promise(function(resolve) {
        chrome.storage.local.get(['folderSortModes'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to load sort modes:', chrome.runtime.lastError);
                resolve({});
                return;
            }
            if (result.folderSortModes) {
                folderSortModes = result.folderSortModes;
            }
            resolve(folderSortModes);
        });
    });
}

// Save sort modes to storage
function saveSortModes() {
    chrome.storage.local.set({ folderSortModes: folderSortModes }, function() {
        if (chrome.runtime.lastError) {
            console.error('Failed to save sort modes:', chrome.runtime.lastError);
        }
    });
}

// Get next sort mode
function getNextSortMode(currentMode) {
    var modes = ['chrome', 'newest', 'az', 'za'];
    var currentIndex = modes.indexOf(currentMode);
    if (currentIndex === -1 || currentIndex === modes.length - 1) {
        return modes[0];
    }
    return modes[currentIndex + 1];
}

// Get sort icon path
function getSortIconPath(mode) {
    var icons = {
        'chrome': 'icons/sort-default.svg',
        'newest': 'icons/sort-newest.svg',
        'az': 'icons/sort-az.svg',
        'za': 'icons/sort-za.svg'
    };
    return icons[mode] || icons['chrome'];
}

// Sort bookmarks by mode
function sortBookmarks(bookmarks, mode) {
    if (mode === 'chrome') {
        return bookmarks;
    }
    
    var sorted = bookmarks.slice();
    
    if (mode === 'newest') {
        sorted.sort(function(a, b) {
            return b.dateAdded - a.dateAdded;
        });
    } else if (mode === 'az') {
        sorted.sort(function(a, b) {
            var titleA = (a.title || '').toLowerCase();
            var titleB = (b.title || '').toLowerCase();
            return titleA.localeCompare(titleB);
        });
    } else if (mode === 'za') {
        sorted.sort(function(a, b) {
            var titleA = (a.title || '').toLowerCase();
            var titleB = (b.title || '').toLowerCase();
            return titleB.localeCompare(titleA);
        });
    }
    
    return sorted;
}

function renderBookmarks(items, listElement) {
    console.log('renderBookmarks called with items:', items.length);
    console.log('Items sample:', items.slice(0, 3));
    listElement.innerHTML = '';
    
    // Group items by folder path
    var groups = {};
    items.forEach(function(item) {
        var folderPath = item.folderPath || 'Без папки';
        if (!groups[folderPath]) {
            groups[folderPath] = [];
        }
        groups[folderPath].push(item);
    });
    
    // Add empty folders from cachedFolderIds
    Object.keys(cachedFolderIds).forEach(function(folderPath) {
        if (!groups[folderPath]) {
            groups[folderPath] = [];
        }
    });

    // Filter out system folders with 0 items, keep all other folders
    var filteredGroups = {};
    Object.keys(groups).forEach(function(key) {
        var folderId = cachedFolderIds[key];
        var isSystemFolder = folderId === '1' || folderId === '2' || folderId === '3' || folderId === '45' || folderId === '743';
        if (groups[key].length > 0 || !isSystemFolder) {
            filteredGroups[key] = groups[key];
        } else {
            console.log('  -> Hiding folder:', key);
        }
    });
    groups = filteredGroups;
    console.log('Final groups:', Object.keys(groups));

// Filter subfolders based on parent folder state
var visibleGroups = {};
Object.keys(groups).forEach(function(key) {
    var folderId = cachedFolderIds[key];
    var isSystemFolder = folderId === '1' || folderId === '2' || folderId === '3' || folderId === '45' || folderId === '743';
    
    // Always show system folders
    if (isSystemFolder) {
        visibleGroups[key] = groups[key];
        return;
    }
    
    // Check if this is a subfolder
    var pathParts = key.split('/');
    if (pathParts.length > 1) {
        var parentPath = pathParts.slice(0, -1).join('/');
        // Check all ancestors up the chain
        var isParentExpanded = true;
        var currentPath = parentPath;
        while (currentPath) {
            if (collapsedFolders[currentPath] === true) {
                isParentExpanded = false;
                break;
            }
            var parts = currentPath.split('/');
            if (parts.length <= 1) {
                break;
            }
            currentPath = parts.slice(0, -1).join('/');
        }
        
        if (isParentExpanded) {
            visibleGroups[key] = groups[key];
        } else {
            console.log('  -> Hiding subfolder (ancestor collapsed):', key);
        }
    } else {
        // Root folders always show
        visibleGroups[key] = groups[key];
    }
});
groups = visibleGroups;
    console.log('Final visible groups:', Object.keys(groups));

    // Sort groups by folder name
    var sortedGroupKeys = Object.keys(groups).sort();

    // Render groups
    sortedGroupKeys.forEach(function(groupKey) {
        // Group container
        var groupContainer = document.createElement('div');
        groupContainer.className = 'group-container';
        groupContainer.dataset.folder = groupKey;
        
        // Group header with folder icon
        var header = document.createElement('div');
        header.className = 'group-header';
        header.style.cursor = 'pointer';

        // Folder icon
        var folderImg = document.createElement('img');
        if (groupKey === 'Favorites bar' || groupKey === 'Bookmarks bar' || folderId === '1' || groupKey.startsWith('Favorites bar/') || groupKey.startsWith('Bookmarks bar/')) {
            folderImg.src = 'icons/star.svg';
            folderImg.alt = 'Favorites';
        } else if (groupKey === 'Other bookmarks' || groupKey === 'Other favorites' || folderId === '2' || groupKey.startsWith('Other bookmarks/') || groupKey.startsWith('Other favorites/')) {
            folderImg.src = 'icons/bookmark.svg';
            folderImg.alt = 'Other bookmarks';
        } else if (groupKey === 'Mobile bookmarks' || groupKey === 'Mobile favorites' || folderId === '3' || folderId === '45' || folderId === '743' || groupKey.startsWith('Mobile bookmarks/') || groupKey.startsWith('Mobile favorites/')) {
            folderImg.src = 'icons/mobile.svg';
            folderImg.alt = 'Mobile bookmarks';
        } else {
            folderImg.src = 'icons/folder.svg';
            folderImg.alt = 'Folder';
        }
        folderImg.className = 'folder-icon';
        folderImg.style.cssText = 'width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px; filter: var(--icon-filter);';

        // Folder name
        var folderNameSpan = document.createElement('span');
        folderNameSpan.className = 'folder-name';
        folderNameSpan.textContent = groupKey;

        // Folder new button (hidden, used for context menu)
        var folderNewBtn = document.createElement('button');
        folderNewBtn.className = 'folder-new-btn';
        folderNewBtn.style.display = 'none';
        var folderNewIcon = document.createElement('img');
        folderNewIcon.src = 'icons/folder-new.svg';
        folderNewIcon.alt = 'New Folder';
        folderNewIcon.style.cssText = 'width:15px;height:15px;display:block;';
        folderNewBtn.appendChild(folderNewIcon);
        
        folderNewBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var container = this.closest('.group-container');
            var header = container.querySelector('.group-header');
            var folderNameSpan = header.querySelector('.folder-name');
            var folderImg = header.querySelector('.folder-icon');
            var addBtn = header.querySelector('.add-btn');
            var sortBtn = header.querySelector('.sort-btn');
            var folderNewBtn = header.querySelector('.folder-new-btn');
            
            // Hide buttons
            if (addBtn) addBtn.style.display = 'none';
            if (sortBtn) sortBtn.style.display = 'none';
            if (folderNewBtn) folderNewBtn.style.display = 'none';

            // Disable all other folders
            document.querySelectorAll('.group-container').forEach(function(otherContainer) {
                if (otherContainer !== container) {
                    otherContainer.classList.add('editing-disabled');
                }
            });
            
            var oldName = folderNameSpan.textContent;
            var folderPath = container.dataset.folder;
            
            // Find folder ID by path
            var folderId = null;
            for (var i = 0; i < cachedBookmarkItems.length; i++) {
                var item = cachedBookmarkItems[i];
                if (item.folderPath === folderPath) {
                    chrome.bookmarks.getSubTree(item.id, function(result) {
                        if (result && result.length > 0) {
                            var parent = result[0];
                            if (parent.children) {
                                folderId = parent.id;
                            } else {
                                chrome.bookmarks.get(item.parentId, function(parentResult) {
                                    if (parentResult && parentResult.length > 0) {
                                        folderId = parentResult[0].id;
                                    }
                                });
                            }
                        }
                    });
                    break;
                }
            }
            
            // Create input
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'edit-input';
            input.id = 'newfolder-' + Date.now();
            input.placeholder = getMessage('newFolderPlaceholder');
            input.style.cssText = 'flex:1;min-width:0;padding:0 8px;height:26px;line-height:26px;border:2px solid var(--input-border);border-radius:4px;background:var(--search-bg);color:var(--search-text);font-size:13px;box-sizing:border-box;';
            input.style.outline = 'none';
            input.setAttribute('autocomplete', 'off');
            input.setAttribute('spellcheck', 'false');
            
            folderNameSpan.innerHTML = '';
            folderNameSpan.appendChild(input);
            
            // Create edit buttons
            var editButtons = document.createElement('span');
            editButtons.className = 'action-buttons';
            editButtons.style.display = 'flex';
            editButtons.style.marginLeft = '6px';
            
            var saveBtn = document.createElement('button');
            saveBtn.className = 'action-btn';
            var saveIcon = document.createElement('img');
            saveIcon.src = 'icons/save.svg';
            saveIcon.alt = 'Save';
            saveBtn.appendChild(saveIcon);
            var saveTooltip = document.createElement('span');
            saveTooltip.className = 'tooltip';
            saveTooltip.textContent = getMessage('saveTooltip');
            saveBtn.appendChild(saveTooltip);
            saveBtn.addEventListener('mouseenter', function(e) {
                e.stopPropagation();
                saveTooltip.classList.add('show');
            });
            saveBtn.addEventListener('mouseleave', function(e) {
                e.stopPropagation();
                saveTooltip.classList.remove('show');
            });
            
            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'action-btn';
            var cancelIcon = document.createElement('img');
            cancelIcon.src = 'icons/close.svg';
            cancelIcon.alt = 'Cancel';
            cancelBtn.appendChild(cancelIcon);
            var cancelTooltip = document.createElement('span');
            cancelTooltip.className = 'tooltip';
            cancelTooltip.textContent = getMessage('cancelTooltip');
            cancelBtn.appendChild(cancelTooltip);
            cancelBtn.addEventListener('mouseenter', function(e) {
                e.stopPropagation();
                cancelTooltip.classList.add('show');
            });
            cancelBtn.addEventListener('mouseleave', function(e) {
                e.stopPropagation();
                cancelTooltip.classList.remove('show');
            });
            
            function saveNewFolder() {
                var name = input.value.trim();
                if (name === '') {
                    cancelNewFolder();
                    return;
                }
                
                // Remove editing-disabled from all containers
                document.querySelectorAll('.group-container.editing-disabled').forEach(function(el) {
                    el.classList.remove('editing-disabled');
                });
                
                // Find folder ID from cachedFolderIds
                var targetFolderId = cachedFolderIds[folderPath];
                if (targetFolderId) {
                    // Close the input field immediately
                    var container = document.querySelector('.group-container[data-folder="' + folderPath + '"]');
                    if (container) {
                        var header = container.querySelector('.group-header');
                        var folderNameSpan = header.querySelector('.folder-name');
                        var addBtn = header.querySelector('.add-btn');
                        var sortBtn = header.querySelector('.sort-btn');
                        var folderNewBtn = header.querySelector('.folder-new-btn');
                        
                        // Restore folder name
                        folderNameSpan.innerHTML = '';
                        folderNameSpan.textContent = oldName;
                        
                        // Show buttons
                        if (addBtn) addBtn.style.display = '';
                        if (sortBtn) sortBtn.style.display = '';
                        if (folderNewBtn) folderNewBtn.style.display = '';
                        
                        // Remove edit buttons
                        var editButtons = container.querySelector('.action-buttons');
                        if (editButtons) editButtons.remove();
                    }
                    
                    createFolder(targetFolderId, name);
                } else {
                    console.log('No matching folder found for path:', folderPath);
                    cancelNewFolder();
                }
            }
            
            function cancelNewFolder() {
                var container = document.querySelector('.group-container[data-folder="' + folderPath + '"]');
                if (container) {
                    var header = container.querySelector('.group-header');
                    var folderNameSpan = header.querySelector('.folder-name');
                    var addBtn = header.querySelector('.add-btn');
                    var sortBtn = header.querySelector('.sort-btn');
                    var folderNewBtn = header.querySelector('.folder-new-btn');
                    
                    folderNameSpan.innerHTML = '';
                    folderNameSpan.textContent = oldName;
                    
                    // Remove editing-disabled from all containers
                    document.querySelectorAll('.group-container.editing-disabled').forEach(function(el) {
                        el.classList.remove('editing-disabled');
                    });
                    
                    if (addBtn) addBtn.style.display = '';
                    if (sortBtn) sortBtn.style.display = '';
                    if (folderNewBtn) folderNewBtn.style.display = '';
                    
                    var editButtons = container.querySelector('.action-buttons');
                    if (editButtons) editButtons.remove();
                }
            }
            
            saveBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                saveNewFolder();
            });
            
            cancelBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                cancelNewFolder();
            });
            
            editButtons.appendChild(saveBtn);
            editButtons.appendChild(cancelBtn);
            header.appendChild(editButtons);
            
            input.focus();
            
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveNewFolder();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelNewFolder();
                }
            });
        });

        // Delete folder button (hidden, used for context menu)
        var folderId = cachedFolderIds[groupKey];
        var isSystemFolder = folderId === '1' || folderId === '2' || folderId === '3' || folderId === '45' || folderId === '743';
        var deleteBtn = null;
        
        if (!isSystemFolder) {
            deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-folder-btn';
            deleteBtn.style.display = 'none';
            var deleteIcon = document.createElement('img');
            deleteIcon.src = 'icons/delete.svg';
            deleteIcon.alt = 'Delete Folder';
            deleteIcon.style.cssText = 'width:15px;height:15px;display:block;';
            deleteBtn.appendChild(deleteIcon);
            
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var container = this.closest('.group-container');
                var header = container.querySelector('.group-header');
                var folderNameSpan = header.querySelector('.folder-name');
                var folderImg = header.querySelector('.folder-icon');
                var addBtn = header.querySelector('.add-btn');
                var sortBtn = header.querySelector('.sort-btn');
                var folderNewBtn = header.querySelector('.folder-new-btn');
                var deleteBtn = header.querySelector('.delete-folder-btn');
                var oldName = folderNameSpan.textContent;
                var folderPath = container.dataset.folder;
                
                deleteFolderById(folderId, folderPath, oldName);
            
            });
        }
        // Add button (hidden, used for context menu)
        var addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.style.display = 'none';
        var addIcon = document.createElement('img');
        addIcon.src = 'icons/star.svg';
        addIcon.alt = 'Add';
        addIcon.style.cssText = 'width:15px;height:15px;display:block;';
        addBtn.appendChild(addIcon);
        
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var container = this.closest('.group-container');
            var folderPath = container.dataset.folder;
            
            // Find folder ID from cachedFolderIds
            var folderId = cachedFolderIds[folderPath];
            if (folderId) {
                addBookmarkToFolder(folderId);
            } else {
                console.log('No matching folder found for path:', folderPath);
            }
        });

        // Sort button (visible)
        var sortBtn = document.createElement('button');
        sortBtn.className = 'sort-btn';
        var folderId = cachedFolderIds[groupKey];
        var currentMode = folderSortModes[groupKey] || 'chrome';
        sortBtn.classList.add('active');
        
        var sortIcon = document.createElement('img');
        sortIcon.src = getSortIconPath(currentMode);
        sortIcon.alt = 'Sort';
        sortIcon.style.cssText = 'width:16px;height:16px;display:block;';
        sortBtn.appendChild(sortIcon);
        
        sortBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log('Sort button clicked');
            var container = this.closest('.group-container');
            var folderKey = container.dataset.folder;
            var currentMode = folderSortModes[folderKey] || 'chrome';
            var nextMode = getNextSortMode(currentMode);
            var icon = this.querySelector('img');
            
            console.log('Current mode:', currentMode, 'Next mode:', nextMode);
            
            if (nextMode === 'chrome') {
                delete folderSortModes[folderKey];
                this.classList.remove('active');
            } else {
                folderSortModes[folderKey] = nextMode;
                this.classList.add('active');
            }
            
            icon.src = getSortIconPath(nextMode);
            
            saveSortModes();
            
            var searchQuery = document.getElementById('search').value;
            filteredBookmarkItems = cachedBookmarkItems.slice();
            displayBookmarks(searchQuery);
        });

        // Menu button (visible)
        var menuBtn = document.createElement('button');
        menuBtn.className = 'menu-btn';
        var menuIcon = document.createElement('img');
        menuIcon.src = 'icons/menu.svg';
        menuIcon.alt = 'Menu';
        menuIcon.style.cssText = 'width:16px;height:16px;display:block;';
        menuBtn.appendChild(menuIcon);

        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var container = this.closest('.group-container');
            var folderPath = container.dataset.folder;
            var folderId = cachedFolderIds[folderPath];
            var isSystemFolder = folderId === '1' || folderId === '2' || folderId === '3' || folderId === '45' || folderId === '743';
            var folderName = container.querySelector('.folder-name').textContent;
            
            var rect = this.getBoundingClientRect();
            showContextMenu(rect.left, rect.bottom, folderPath, folderId, isSystemFolder, folderName, container);
        });

        header.appendChild(folderImg);
        header.appendChild(folderNameSpan);
        if (folderNewBtn) {
            header.appendChild(folderNewBtn);
        }
        if (addBtn) {
            header.appendChild(addBtn);
        }
        if (deleteBtn) {
            header.appendChild(deleteBtn);
        }
        if (sortBtn) {
            header.appendChild(sortBtn);
        }
        if (menuBtn) {
            header.appendChild(menuBtn);
        }
        groupContainer.appendChild(header);
        
        // Context menu
        header.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            var container = this.closest('.group-container');
            var folderPath = container.dataset.folder;
            var folderId = cachedFolderIds[folderPath];
            var isSystemFolder = folderId === '1' || folderId === '2' || folderId === '3' || folderId === '45' || folderId === '743';
            var folderName = this.querySelector('.folder-name').textContent;
            
            showContextMenu(e.clientX, e.clientY, folderPath, folderId, isSystemFolder, folderName, container);
        });

        // Items container
        var itemsContainer = document.createElement('div');
        itemsContainer.className = 'group-items';
        
        // Get sort mode for this folder
        var sortMode = folderSortModes[groupKey] || 'chrome';
        
        // Sort items
        var sortedItems = sortBookmarks(groups[groupKey], sortMode);
        
        // Render items in this group
        sortedItems.forEach(function(item) {
            var li = createBookmarkItem(item);
            itemsContainer.appendChild(li);
        });
        
        // Apply collapsed state before appending items container
        if (collapsedFolders[groupKey] === true) {
            itemsContainer.style.display = 'none';
            groupContainer.dataset.collapsed = 'true';
        } else {
            itemsContainer.style.display = '';
            groupContainer.dataset.collapsed = 'false';
        }
        
        groupContainer.appendChild(itemsContainer);
        listElement.appendChild(groupContainer);
        
    // Toggle collapse on header click
header.addEventListener('click', function(e) {
    // Block click if editing folder
    if (editingBookmarkId !== null && editingBookmarkId.toString().startsWith('folder-')) {
        e.stopPropagation();
        return;
    }
    e.stopPropagation();
    var container = this.parentElement;
    var items = container.querySelector('.group-items');
    var folderName = container.dataset.folder;
    var icon = container.querySelector('.folder-icon');
    
    // Store for saving subfolder states
    var savedSubfolderStates = {};
    
    function saveSubfoldersState(parentPath) {
        for (var key in collapsedFolders) {
            if (key.startsWith(parentPath + '/') && key !== parentPath) {
                savedSubfolderStates[key] = collapsedFolders[key];
                saveSubfoldersState(key);
            }
        }
    }
    
    function restoreSubfoldersState(parentPath) {
        for (var key in savedSubfolderStates) {
            if (key.startsWith(parentPath + '/') && key !== parentPath) {
                collapsedFolders[key] = savedSubfolderStates[key];
                restoreSubfoldersState(key);
            }
        }
    }
    
    function setSubfoldersState(parentPath, state) {
        for (var key in cachedFolderIds) {
            if (key.startsWith(parentPath + '/') && key !== parentPath) {
                collapsedFolders[key] = state;
                setSubfoldersState(key, state);
            }
        }
    }
    
    if (items.style.display === 'none') {
        items.style.display = '';
        container.dataset.collapsed = 'false';
        collapsedFolders[folderName] = false;
        if (icon && folderName !== 'Favorites bar' && folderName !== 'Bookmarks bar') {
            icon.src = 'icons/folder-open.svg';
        }
        
        // Restore subfolder states
        restoreSubfoldersState(folderName);
    } else {
        // Save current subfolder states before collapsing
        saveSubfoldersState(folderName);
        
        items.style.display = 'none';
        container.dataset.collapsed = 'true';
        collapsedFolders[folderName] = true;
        if (icon && folderName !== 'Favorites bar' && folderName !== 'Bookmarks bar') {
            icon.src = 'icons/folder.svg';
        }
        
        // Collapse all subfolders
        setSubfoldersState(folderName, true);
    }
    saveCollapsedState();
    
    // Re-render to show/hide subfolders
    var searchQuery = document.getElementById('search').value;
    displayBookmarks(searchQuery);
});
    
    // Track active folder when clicking on links inside folder
    itemsContainer.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function(e) {
            document.querySelectorAll('.group-header.active-folder').forEach(function(el) {
                el.classList.remove('active-folder');
            });
            header.classList.add('active-folder');
        });
    });
    });
}

// Function to load and display bookmarks
function loadBookmarks(query = '') {
    console.log('loadBookmarks called with query:', query);
    const listElement = document.getElementById('history-list');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    // Load collapsed state and sort modes from storage first
    Promise.all([loadCollapsedState(), loadSortModes()]).then(function() {
        console.log('loadBookmarks: cachedBookmarkItems.length:', cachedBookmarkItems.length);
        if (cachedBookmarkItems.length === 0) {
            console.log('loadBookmarks: loading bookmarks to cache...');
            listElement.innerHTML = '';
            loadingIndicator.style.display = 'block';
            loadingIndicator.textContent = getMessage('loadingText');
            loadBookmarksToCache().then(function() {
                console.log('loadBookmarks: loadBookmarksToCache done, items:', cachedBookmarkItems.length);
                displayBookmarks(query);
                loadingIndicator.style.display = 'none';
            }).catch(function(error) {
                console.error('Failed to load bookmarks:', error);
                loadingIndicator.style.display = 'none';
                listElement.innerHTML = '<li>Error loading bookmarks</li>';
            });
        } else {
            console.log('loadBookmarks: using cached items');
            displayBookmarks(query);
        }
    });
}

// Search with debounce and min chars
var searchDebounceTimer = null;

function handleSearchInput(query) {
    const listElement = document.getElementById('history-list');
    
    // Clear previous timer
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }
    
    // If query is empty, show all bookmarks
    if (query.length === 0) {
        loadBookmarks('');
        return;
    }
    
    // If 1-2 characters, show message
    if (query.length < 3) {
        listElement.innerHTML = '<li style="text-align:center;color:var(--time-color);padding:20px;">' + getMessage('searchMinChars') + '</li>';
        return;
    }
    
    // If 3+ characters, debounce search
    searchDebounceTimer = setTimeout(function() {
        // Search across all bookmarks
        const loadingIndicator = document.getElementById('loadingIndicator');
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = getMessage('loadingText');
        
        searchBookmarksAll(query).then(function(items) {
            loadingIndicator.style.display = 'none';
            const listElement = document.getElementById('history-list');
            if (items.length === 0) {
                listElement.innerHTML = '<li>' + getMessage('nothingFound') + '</li>';
                return;
            }
            renderBookmarks(items, listElement);
        }).catch(function(error) {
            console.error('Search failed:', error);
            loadingIndicator.style.display = 'none';
            listElement.innerHTML = '<li>Search error</li>';
        });
        
        searchDebounceTimer = null;
    }, 250);
}


// Load bookmarks when the sidebar is opened
document.addEventListener('DOMContentLoaded', function() {
    // Set localized texts
    document.getElementById('search').placeholder = getMessage('searchPlaceholder');
    document.getElementById('loadingIndicator').textContent = getMessage('loadingText');

    // Clear search button
    var clearBtn = document.getElementById('clearSearchBtn');
    var searchInput = document.getElementById('search');
    
    searchInput.addEventListener('input', function() {
        var query = this.value;
        
        if (query.length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
        
        handleSearchInput(query);
    });
    
    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearBtn.classList.remove('visible');
        searchInput.focus();
        handleSearchInput('');
    });
    
    // Listen for bookmark changes
    chrome.bookmarks.onCreated.addListener(function(id, bookmark) {
        loadBookmarksToCache().then(function() {
            filteredBookmarkItems = cachedBookmarkItems.slice();
            var searchQuery = document.getElementById('search').value;
            displayBookmarks(searchQuery);
            saveCollapsedState();
        });
    });

    chrome.bookmarks.onRemoved.addListener(function(id, removeInfo) {
        loadBookmarksToCache().then(function() {
            filteredBookmarkItems = cachedBookmarkItems.slice();
            var searchQuery = document.getElementById('search').value;
            displayBookmarks(searchQuery);
            saveCollapsedState();
        });
    });

    chrome.bookmarks.onChanged.addListener(function(id, changeInfo) {
        loadBookmarksToCache().then(function() {
            filteredBookmarkItems = cachedBookmarkItems.slice();
            var searchQuery = document.getElementById('search').value;
            displayBookmarks(searchQuery);
            saveCollapsedState();
        });
    });

    chrome.bookmarks.onMoved.addListener(function(id, moveInfo) {
        loadBookmarksToCache().then(function() {
            filteredBookmarkItems = cachedBookmarkItems.slice();
            var searchQuery = document.getElementById('search').value;
            displayBookmarks(searchQuery);
            saveCollapsedState();
        });
    });
    
    loadBookmarks('');

});

// Reposition URL tooltips on window resize
window.addEventListener('resize', function() {
    document.querySelectorAll('.url-tooltip.show').forEach(function(tooltip) {
        var parent = tooltip.closest('li');
        if (parent) {
            positionTooltip(parent, tooltip);
        }
    });
});

function getHostname(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return url;
    }
}

function refreshBookmarks() {
    cachedBookmarksHash = '';
    lastQuery = '';
    var searchQuery = document.getElementById('search').value;
    
    // Save current collapsed state before reload
    document.querySelectorAll('.group-container').forEach(function(container) {
        var folderName = container.dataset.folder;
        if (folderName) {
            collapsedFolders[folderName] = container.dataset.collapsed === 'true';
        }
    });
    
    loadBookmarksToCache().then(function() {
        filteredBookmarkItems = cachedBookmarkItems.slice();
        displayBookmarks(searchQuery);
        saveCollapsedState();
    }).catch(function(error) {
        console.error('Failed to refresh bookmarks:', error);
    });
}

// Save collapsed state to storage
function saveCollapsedState() {
    chrome.storage.local.set({ collapsedFolders: collapsedFolders }, function() {
        if (chrome.runtime.lastError) {
            console.error('Failed to save collapsed state:', chrome.runtime.lastError);
        }
    });
}

// Load collapsed state from storage
function loadCollapsedState() {
    return new Promise(function(resolve) {
        chrome.storage.local.get(['collapsedFolders'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to load collapsed state:', chrome.runtime.lastError);
                resolve({});
                return;
            }
            if (result.collapsedFolders) {
                collapsedFolders = result.collapsedFolders;
            }
            resolve(collapsedFolders);
        });
    });
}

function saveEdit(li, input) {
    if (editingBookmarkId === null) {
        return;
    }
    
    var newTitle = input.value.trim();
    var oldTitle = li.dataset.originalTitle || '';
    var id = li.dataset.bookmarkId;
    
    if (newTitle === oldTitle || newTitle === '') {
        cancelEdit(li);
        return;
    }
    
    chrome.bookmarks.update(id, { title: newTitle }, function() {
        if (chrome.runtime.lastError) {
            console.error('Failed to update bookmark:', chrome.runtime.lastError);
            cancelEdit(li);
            return;
        }
        
        document.querySelectorAll('li.editing-disabled').forEach(function(otherLi) {
            otherLi.classList.remove('editing-disabled');
        });
        
        var linkContainer = li.querySelector('.link-container');
        var bookmarkUrl = li.dataset.bookmarkUrl || '';
        linkContainer.innerHTML = '';
        var link = document.createElement('a');
        link.href = bookmarkUrl;
        link.target = '_blank';
        link.textContent = newTitle;
        linkContainer.appendChild(link);
        
        var editButtons = li.querySelector('.action-buttons:last-child');
        var originalButtons = li.querySelector('.action-buttons');
        if (editButtons && editButtons !== originalButtons) {
            editButtons.remove();
        }
        
        if (originalButtons) {
            originalButtons.style.display = '';
        }
        
        var timeSpan = li.querySelector('.time');
        if (timeSpan) timeSpan.style.display = '';
        
        editingBookmarkId = null;
        showToast(getMessage('renameSuccess'));
        
        var item = cachedBookmarkItems.find(function(b) {
            return b.id === id;
        });
        if (item) {
            item.title = newTitle;
        }
    });
    
    editingBookmarkId = null;
}

function cancelEdit(li) {
    if (editingBookmarkId === null) {
        return;
    }
    
    var liId = li ? li.dataset.bookmarkId : null;
    if (liId && liId !== String(editingBookmarkId)) {
        return;
    }
    
    document.querySelectorAll('li.editing-disabled').forEach(function(otherLi) {
        otherLi.classList.remove('editing-disabled');
    });
    
    if (!li || !li.parentNode) {
        editingBookmarkId = null;
        return;
    }
    
    var linkContainer = li.querySelector('.link-container');
    var oldTitle = li.dataset.originalTitle || '';
    var bookmarkUrl = li.dataset.bookmarkUrl || '';
    
    linkContainer.innerHTML = '';
    var link = document.createElement('a');
    link.href = bookmarkUrl;
    link.target = '_blank';
    link.textContent = oldTitle;
    linkContainer.appendChild(link);
    
    var editButtons = li.querySelector('.action-buttons:last-child');
    var originalButtons = li.querySelector('.action-buttons');
    if (editButtons && editButtons !== originalButtons) {
        editButtons.remove();
    }
    
    if (originalButtons) {
        originalButtons.style.display = '';
    }
    
    var timeSpan = li.querySelector('.time');
    if (timeSpan) timeSpan.style.display = '';
    
    var input = li.querySelector('.edit-input');
    if (input) {
        input.remove();
    }
    
    editingBookmarkId = null;
}

var cachedBookmarksHash = '';
var lastQuery = '';

function getBookmarksHash() {
    return JSON.stringify(cachedBookmarkItems.map(function(item) {
        return item.id + item.title + item.url + item.dateAdded;
    }));
}

function displayBookmarks(query) {
    console.log('displayBookmarks called with query:', query);
    console.log('cachedBookmarkItems length:', cachedBookmarkItems.length);
    
    // Save current collapsed state before re-render
    document.querySelectorAll('.group-container').forEach(function(container) {
        var folderName = container.dataset.folder;
        if (folderName) {
            collapsedFolders[folderName] = container.dataset.collapsed === 'true';
        }
    });

    const listElement = document.getElementById('history-list');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    if (cachedBookmarkItems.length === 0) {
        loadingIndicator.style.display = 'none';
        listElement.innerHTML = '<li>' + getMessage('nothingFound') + '</li>';
        return;
    }

    var items = cachedBookmarkItems;
    
    if (query && query.trim() !== '') {
        var lowerQuery = query.toLowerCase();
        items = items.filter(function(item) {
            var titleMatch = item.title && item.title.toLowerCase().includes(lowerQuery);
            var urlMatch = item.url && item.url.toLowerCase().includes(lowerQuery);
            return titleMatch || urlMatch;
        });
    }

    loadingIndicator.style.display = 'none';

    if (items.length === 0) {
        listElement.innerHTML = '<li>' + getMessage('nothingFound') + '</li>';
        return;
    }

    renderBookmarks(items, listElement);
    saveCollapsedState();
}

function addBookmarkToFolder(parentId) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs.length === 0) {
            return;
        }
        var tab = tabs[0];
        chrome.bookmarks.create({
            parentId: parentId,
            title: tab.title,
            url: tab.url
        }, function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to add bookmark:', chrome.runtime.lastError);
                return;
            }
            showToast(getMessage('bookmarkAdded'));
            
            // Find folder path by parentId
            var folderPath = null;
            for (var path in cachedFolderIds) {
                if (cachedFolderIds[path] === parentId) {
                    folderPath = path;
                    break;
                }
            }
            
            // Reload cache and redraw
            loadBookmarksToCache().then(function() {
                filteredBookmarkItems = cachedBookmarkItems.slice();
                var searchQuery = document.getElementById('search').value;
                displayBookmarks(searchQuery);
                saveCollapsedState();
                
                // Expand folder after redraw
                if (folderPath) {
                    collapsedFolders[folderPath] = false;
                    saveCollapsedState();
                    var container = document.querySelector('.group-container[data-folder="' + folderPath + '"]');
                    if (container) {
                        var items = container.querySelector('.group-items');
                        var icon = container.querySelector('.folder-icon');
                        if (items && items.style.display === 'none') {
                            items.style.display = '';
                            container.dataset.collapsed = 'false';
                            if (icon && folderPath !== 'Favorites bar' && folderPath !== 'Bookmarks bar') {
                                icon.src = 'icons/folder-open.svg';
                            }
                        }
                    }
                }
            });
        });
    });
}

function createFolder(parentId, name) {
    chrome.bookmarks.create({
        parentId: parentId,
        title: name
    }, function(result) {
        if (chrome.runtime.lastError) {
            console.error('Failed to create folder:', chrome.runtime.lastError);
            return;
        }
        showToast(getMessage('folderCreated'));
        
        // Find parent path
        var parentPath = null;
        for (var path in cachedFolderIds) {
            if (cachedFolderIds[path] === parentId) {
                parentPath = path;
                break;
            }
        }
        
        // Set collapsed state for new folder
        var newPath = parentPath ? parentPath + '/' + name : name;
        if (parentPath && collapsedFolders[parentPath] === true) {
            collapsedFolders[newPath] = true;
        } else {
            collapsedFolders[newPath] = false;
        }
        saveCollapsedState();
        
        forceRefreshBookmarks();
    });
}

function showContextMenu(x, y, folderPath, folderId, isSystemFolder, folderName, container) {
    var menu = document.getElementById('contextMenu');
    
    // Close any existing menu
    closeContextMenu();
    
    // Build menu items
    var items = [
        {
            id: 'create-folder',
            icon: 'icons/folder-new.svg',
            label: getMessage('contextCreateFolder')
        },
        {
            id: 'add-bookmark',
            icon: 'icons/star.svg',
            label: getMessage('contextAddBookmark')
        },
        {
            id: 'rename-folder',
            icon: 'icons/rename.svg',
            label: getMessage('contextRenameFolder')
        }
    ];
    
    // Add delete option only for non-system folders
    if (!isSystemFolder) {
        items.push({
            id: 'delete-folder',
            icon: 'icons/delete.svg',
            label: getMessage('contextDeleteFolder')
        });
    }
    
    // Build menu HTML
    menu.innerHTML = '';
    items.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'menu-item';
        div.dataset.action = item.id;
        div.dataset.folderPath = folderPath;
        div.dataset.folderId = folderId;
        div.dataset.folderName = folderName;
        
        var img = document.createElement('img');
        img.src = item.icon;
        img.alt = '';
        div.appendChild(img);
        
        var span = document.createElement('span');
        span.textContent = item.label;
        div.appendChild(span);
        
        div.addEventListener('click', function(e) {
            e.stopPropagation();
            var action = this.dataset.action;
            var path = this.dataset.folderPath;
            var container = document.querySelector('.group-container[data-folder="' + path + '"]');
            
            switch(action) {
                case 'create-folder':
                    handleCreateFolder(container);
                    break;
                case 'add-bookmark':
                    handleAddBookmark(container);
                    break;
                case 'rename-folder':
                    handleRenameFolder(container);
                    break;
                case 'delete-folder':
                    handleDeleteFolder(container);
                    break;
            }
            closeContextMenu();
        });
        
        menu.appendChild(div);
    });
    
    // Position menu
    var menuWidth = 180;
    var menuHeight = items.length * 38 + 12;
    var maxX = window.innerWidth - menuWidth - 10;
    var maxY = window.innerHeight - menuHeight - 10;
    
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';
    menu.classList.add('active');
    
    // Close on click outside
    setTimeout(function() {
        document.addEventListener('click', closeContextMenu);
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeContextMenu();
            }
        });
    }, 0);
    
    // Auto close after 5 seconds
    window.contextMenuTimer = null;
    
    function resetContextMenuTimeout() {
        if (window.contextMenuTimer) {
            clearTimeout(window.contextMenuTimer);
        }
        window.contextMenuTimer = setTimeout(function() {
            closeContextMenu();
        }, 5000);
    }
    
    // Reset timer on any mouse movement inside menu
    menu.addEventListener('mousemove', function() {
        resetContextMenuTimeout();
    });
    
    // Initial timer
    resetContextMenuTimeout();
    }
    
    function closeContextMenu() {
        var menu = document.getElementById('contextMenu');
        menu.classList.remove('active');
        menu.innerHTML = '';
        document.removeEventListener('click', closeContextMenu);
        if (window.contextMenuTimer) {
            clearTimeout(window.contextMenuTimer);
            window.contextMenuTimer = null;
        }
}

function handleCreateFolder(container) {
    if (!container) return;
    var folderNewBtn = container.querySelector('.folder-new-btn');
    if (folderNewBtn) {
        folderNewBtn.click();
    }
}

function handleAddBookmark(container) {
    if (!container) return;
    var addBtn = container.querySelector('.add-btn');
    if (addBtn) {
        addBtn.click();
    }
}

function handleRenameFolder(container) {
    if (!container) return;
    
    // Block if already editing
    if (editingBookmarkId !== null) {
        return;
    }
    
    var header = container.querySelector('.group-header');
    var folderNameSpan = header.querySelector('.folder-name');
    var oldName = folderNameSpan.textContent;
    var folderPath = container.dataset.folder;
    var folderId = cachedFolderIds[folderPath];
    
    if (!folderId) return;
    
    // Set editing state
    editingBookmarkId = 'folder-' + folderId;
    
    // Hide sort button and menu button
    var sortBtn = header.querySelector('.sort-btn');
    var menuBtn = header.querySelector('.menu-btn');
    if (sortBtn) sortBtn.style.display = 'none';
    if (menuBtn) menuBtn.style.display = 'none';
    
    // Disable all other containers
    document.querySelectorAll('.group-container').forEach(function(otherContainer) {
        if (otherContainer !== container) {
            otherContainer.classList.add('editing-disabled');
        }
    });
    
    // Create input
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.id = 'rename-folder-' + Date.now();
    input.value = oldName;
    input.style.cssText = 'flex:1;min-width:0;padding:0 8px;height:26px;line-height:26px;border:2px solid var(--input-border);border-radius:4px;background:var(--search-bg);color:var(--search-text);font-size:13px;box-sizing:border-box;';
    input.style.outline = 'none';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    
    folderNameSpan.innerHTML = '';
    folderNameSpan.appendChild(input);
    
    // Create edit buttons
    var editButtons = document.createElement('span');
    editButtons.className = 'action-buttons';
    editButtons.style.display = 'flex';
    editButtons.style.marginLeft = '6px';
    
    var saveBtn = document.createElement('button');
    saveBtn.className = 'action-btn';
    var saveIcon = document.createElement('img');
    saveIcon.src = 'icons/save.svg';
    saveIcon.alt = 'Save';
    saveBtn.appendChild(saveIcon);
    var saveTooltip = document.createElement('span');
    saveTooltip.className = 'tooltip';
    saveTooltip.textContent = getMessage('saveTooltip');
    saveBtn.appendChild(saveTooltip);
    saveBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        saveTooltip.classList.add('show');
    });
    saveBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        saveTooltip.classList.remove('show');
    });
    
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-btn';
    var cancelIcon = document.createElement('img');
    cancelIcon.src = 'icons/close.svg';
    cancelIcon.alt = 'Cancel';
    cancelBtn.appendChild(cancelIcon);
    var cancelTooltip = document.createElement('span');
    cancelTooltip.className = 'tooltip';
    cancelTooltip.textContent = getMessage('cancelTooltip');
    cancelBtn.appendChild(cancelTooltip);
    cancelBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        cancelTooltip.classList.add('show');
    });
    cancelBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        cancelTooltip.classList.remove('show');
    });
    
    function saveRename() {
        var newName = input.value.trim();
        if (newName === '' || newName === oldName) {
            cancelRename();
            return;
        }
        
        chrome.bookmarks.update(folderId, { title: newName }, function() {
            if (chrome.runtime.lastError) {
                console.error('Failed to rename folder:', chrome.runtime.lastError);
                cancelRename();
                return;
            }
            showToast(getMessage('renameSuccess'));
            
            // Remove old path from cachedFolderIds and add new one
            var oldPath = folderPath;
            var newPath = folderPath.substring(0, folderPath.lastIndexOf('/') + 1) + newName;
            if (cachedFolderIds[oldPath]) {
                var id = cachedFolderIds[oldPath];
                delete cachedFolderIds[oldPath];
                cachedFolderIds[newPath] = id;
            }
            
            editingBookmarkId = null;
            forceRefreshBookmarks();
        });
    }
    
    function cancelRename() {
        editingBookmarkId = null;
        document.querySelectorAll('.group-container.editing-disabled').forEach(function(el) {
            el.classList.remove('editing-disabled');
        });
        
        var container = document.querySelector('.group-container[data-folder="' + folderPath + '"]');
        if (container) {
            var header = container.querySelector('.group-header');
            var folderNameSpan = header.querySelector('.folder-name');
            var sortBtn = header.querySelector('.sort-btn');
            var menuBtn = header.querySelector('.menu-btn');
            
            folderNameSpan.innerHTML = '';
            folderNameSpan.textContent = oldName;
            
            if (sortBtn) sortBtn.style.display = '';
            if (menuBtn) menuBtn.style.display = '';
            
            var editButtons = container.querySelector('.action-buttons');
            if (editButtons) editButtons.remove();
        }
    }
    
    saveBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        saveRename();
    });
    
    cancelBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        cancelRename();
    });
    
    editButtons.appendChild(saveBtn);
    editButtons.appendChild(cancelBtn);
    header.appendChild(editButtons);
    
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelRename();
        }
    });
    
    // Click outside to cancel - like in bookmark editing
    function handleOutsideClick(e) {
        var target = e.target;
        // Don't cancel if clicking on save/cancel buttons or input
        if (target === input || target.closest('.action-btn') || target.closest('.edit-input')) {
            return;
        }
        // Don't cancel if clicking on bookmark editing elements
        if (target.closest('li') && target.closest('li').querySelector('.edit-input')) {
            return;
        }
        if (!header.contains(target) && !editButtons.contains(target)) {
            cancelRename();
            document.removeEventListener('click', handleOutsideClick);
        }
    }
    
    setTimeout(function() {
        document.addEventListener('click', handleOutsideClick);
    }, 0);
    
    setTimeout(function() {
        document.addEventListener('click', handleOutsideClick);
    }, 0);
}

function handleDeleteFolder(container) {
    if (!container) return;
    var folderPath = container.dataset.folder;
    var folderId = cachedFolderIds[folderPath];
    var header = container.querySelector('.group-header');
    var folderName = header.querySelector('.folder-name').textContent;
    
    deleteFolderById(folderId, folderPath, folderName);
}

function deleteFolderById(folderId, folderPath, folderName) {
    console.log('deleteFolderById called with:', { folderId, folderPath, folderName });
    console.log('cachedFolderIds keys:', Object.keys(cachedFolderIds));
    if (!folderId) {
        console.error('No folder ID provided');
        return;
    }
    
    var container = document.querySelector('.group-container[data-folder="' + folderPath + '"]');
    if (!container) {
        console.error('Container not found for path:', folderPath);
        return;
    }
    
    var header = container.querySelector('.group-header');
    var folderNameSpan = header.querySelector('.folder-name');
    var oldName = folderNameSpan.textContent;
    
    // Hide sort button
    var sortBtn = header.querySelector('.sort-btn');
    if (sortBtn) sortBtn.style.display = 'none';
    
    // Show confirmation message
    var confirmText = document.createElement('span');
    confirmText.className = 'folder-name';
    confirmText.style.cssText = 'flex:1;min-width:0;color:var(--text-color);font-weight:400;';
    confirmText.textContent = getMessage('deleteFolderConfirm').replace('{name}', folderName || oldName);
    folderNameSpan.innerHTML = '';
    folderNameSpan.appendChild(confirmText);
    
    // Create action buttons
    var actionButtons = document.createElement('span');
    actionButtons.className = 'action-buttons';
    actionButtons.style.display = 'flex';
    actionButtons.style.marginLeft = '6px';
    actionButtons.style.gap = '6px';
    
    // Delete button
    var deleteActionBtn = document.createElement('button');
    deleteActionBtn.className = 'action-btn';
    deleteActionBtn.style.opacity = '1';
    var deleteActionIcon = document.createElement('img');
    deleteActionIcon.src = 'icons/save.svg';
    deleteActionIcon.alt = 'Delete';
    deleteActionIcon.style.cssText = 'width:15px;height:15px;display:block;filter:var(--icon-filter);';
    deleteActionBtn.appendChild(deleteActionIcon);
    var deleteActionTooltip = document.createElement('span');
    deleteActionTooltip.className = 'tooltip';
    deleteActionTooltip.textContent = getMessage('deleteFolderDelete');
    deleteActionBtn.appendChild(deleteActionTooltip);
    deleteActionBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        deleteActionTooltip.classList.add('show');
    });
    deleteActionBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        deleteActionTooltip.classList.remove('show');
    });
    
    // Cancel button
    var cancelActionBtn = document.createElement('button');
    cancelActionBtn.className = 'action-btn';
    cancelActionBtn.style.opacity = '1';
    var cancelActionIcon = document.createElement('img');
    cancelActionIcon.src = 'icons/close.svg';
    cancelActionIcon.alt = 'Cancel';
    cancelActionIcon.style.cssText = 'width:15px;height:15px;display:block;filter:var(--icon-filter);';
    cancelActionBtn.appendChild(cancelActionIcon);
    var cancelActionTooltip = document.createElement('span');
    cancelActionTooltip.className = 'tooltip';
    cancelActionTooltip.textContent = getMessage('deleteFolderCancel');
    cancelActionBtn.appendChild(cancelActionTooltip);
    cancelActionBtn.addEventListener('mouseenter', function(e) {
        e.stopPropagation();
        cancelActionTooltip.classList.add('show');
    });
    cancelActionBtn.addEventListener('mouseleave', function(e) {
        e.stopPropagation();
        cancelActionTooltip.classList.remove('show');
    });
    
    function confirmDelete() {
        chrome.bookmarks.removeTree(folderId, function() {
            if (chrome.runtime.lastError) {
                console.error('Failed to delete folder:', chrome.runtime.lastError);
                return;
            }
            showToast(getMessage('folderDeleted'));
            forceRefreshBookmarks();
        });
    }
    
    function cancelDelete() {
        var container = document.querySelector('.group-container[data-folder="' + folderPath + '"]');
        if (container) {
            var header = container.querySelector('.group-header');
            var folderNameSpan = header.querySelector('.folder-name');
            var sortBtn = header.querySelector('.sort-btn');
            
            folderNameSpan.innerHTML = '';
            folderNameSpan.textContent = oldName;
            
            if (sortBtn) sortBtn.style.display = '';
            
            var actionButtons = container.querySelector('.action-buttons');
            if (actionButtons) actionButtons.remove();
        }
    }
    
    deleteActionBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        confirmDelete();
    });
    
    cancelActionBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        cancelDelete();
    });
    
    actionButtons.appendChild(deleteActionBtn);
    actionButtons.appendChild(cancelActionBtn);
    header.appendChild(actionButtons);
    
    // Keyboard support
    var keyHandler = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmDelete();
            document.removeEventListener('keydown', keyHandler);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelDelete();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
}

function forceRefreshBookmarks() {
    cachedBookmarksHash = '';
    lastQuery = '';
    cachedBookmarkItems = [];
    cachedFolderIds = {};
    filteredBookmarkItems = [];
    var searchQuery = document.getElementById('search').value;
    loadBookmarksToCache().then(function() {
        filteredBookmarkItems = cachedBookmarkItems.slice();
        displayBookmarks(searchQuery);
        saveCollapsedState();
    });
}
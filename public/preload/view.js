/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const {
  ipcRenderer,
  remote,
  webFrame,
} = require('electron');
const {
  enable: enableDarkMode,
  disable: disableDarkMode,
  setFetchMethod: setFetchMethodDarkMode,
} = require('darkreader');
const nodeFetch = require('node-fetch');

const ContextMenuBuilder = require('../libs/context-menu-builder');

const { MenuItem, shell } = remote;

const { workspaceId } = remote.getCurrentWebContents();

const loadDarkReader = () => {
  const shouldUseDarkColor = ipcRenderer.sendSync('get-should-use-dark-colors');
  const workspaceDarkReader = ipcRenderer.sendSync('get-workspace-preference', workspaceId, 'darkReader');
  const darkReader = workspaceDarkReader != null
    ? workspaceDarkReader
    : ipcRenderer.sendSync('get-preference', 'darkReader');
  if (shouldUseDarkColor && darkReader) {
    let darkReaderBrightness;
    let darkReaderContrast;
    let darkReaderGrayscale;
    let darkReaderSepia;

    // if workspaceDarkReader is defined
    // use darkReader config
    if (workspaceDarkReader != null) {
      const workspacePreferences = ipcRenderer.sendSync('get-workspace-preferences', workspaceId);
      darkReaderBrightness = workspacePreferences.darkReaderBrightness || 100;
      darkReaderContrast = workspacePreferences.darkReaderContrast || 100;
      darkReaderGrayscale = workspacePreferences.darkReaderGrayscale || 0;
      darkReaderSepia = workspacePreferences.darkReaderSepia || 0;
    } else {
      const preferences = ipcRenderer.sendSync('get-preferences');
      darkReaderBrightness = preferences.darkReaderBrightness;
      darkReaderContrast = preferences.darkReaderContrast;
      darkReaderGrayscale = preferences.darkReaderGrayscale;
      darkReaderSepia = preferences.darkReaderSepia;
    }
    // use node-fetch
    // to avoid CORS-related issues
    // see https://github.com/webcatalog/webcatalog-app/issues/993
    setFetchMethodDarkMode((url) => nodeFetch(url));
    enableDarkMode({
      darkReaderBrightness,
      darkReaderContrast,
      darkReaderGrayscale,
      darkReaderSepia,
    });
  } else {
    disableDarkMode();
  }
};

let handled = false;
const handleLoaded = (event) => {
  if (handled) return;
  // eslint-disable-next-line no-console
  console.log(`Preload script is loading on ${event}...`);

  loadDarkReader();
  ipcRenderer.on('reload-dark-reader', () => {
    loadDarkReader();
  });

  const preferences = ipcRenderer.sendSync('get-preferences');
  const workspacePreferences = ipcRenderer.sendSync('get-workspace-preferences', workspaceId);

  const jsCodeInjection = workspacePreferences.jsCodeInjection || preferences.jsCodeInjection;
  const allowNodeInJsCodeInjection = workspacePreferences.jsCodeInjection
    ? Boolean(workspacePreferences.allowNodeInJsCodeInjection)
    : preferences.allowNodeInJsCodeInjection;
  const cssCodeInjection = workspacePreferences.cssCodeInjection || preferences.cssCodeInjection;
  const autoRefresh = workspacePreferences.autoRefresh || preferences.autoRefresh;
  const autoRefreshInterval = workspacePreferences.autoRefresh
    ? (workspacePreferences.autoRefreshInterval || preferences.autoRefreshInterval)
    : preferences.autoRefreshInterval;
  const autoRefreshOnlyWhenInactive = workspacePreferences.autoRefreshOnlyWhenInactive
    || preferences.autoRefreshOnlyWhenInactive;

  if (autoRefresh) {
    setTimeout(() => {
      if (autoRefreshOnlyWhenInactive && remote.getCurrentWebContents().isFocused()) {
        return;
      }

      window.location.reload();
    }, autoRefreshInterval);
  }

  if (jsCodeInjection && jsCodeInjection.trim().length > 0) {
    if (allowNodeInJsCodeInjection) {
      try {
        // eslint-disable-next-line no-new-func
        Function(
          'require',
          `"use strict";${jsCodeInjection}`,
        )(require);
      } catch (err) {
        /* eslint-disable no-console */
        console.log(err);
        /* eslint-enable no-console */
      }
    } else {
      try {
        const node = document.createElement('script');
        node.innerHTML = jsCodeInjection;
        document.body.appendChild(node);
      } catch (err) {
        /* eslint-disable no-console */
        console.log(err);
        /* eslint-enable no-console */
      }
    }
  }

  if (cssCodeInjection && cssCodeInjection.trim().length > 0) {
    try {
      const node = document.createElement('style');
      node.innerHTML = cssCodeInjection;
      document.body.appendChild(node);
    } catch (err) {
      /* eslint-disable no-console */
      console.log(err);
      /* eslint-enable no-console */
    }
  }

  window.contextMenuBuilder = new ContextMenuBuilder(
    null,
    true,
  );

  remote.getCurrentWebContents().on('context-menu', (e, info) => {
    window.contextMenuBuilder.buildMenuForElement(info)
      .then((menu) => {
        if (info.linkURL && info.linkURL.length > 0) {
          menu.append(new MenuItem({ type: 'separator' }));

          menu.append(new MenuItem({
            label: 'Open Link in New Window',
            click: () => {
              ipcRenderer.send('request-set-global-force-new-window', true);
              window.open(info.linkURL);
            },
          }));

          menu.append(new MenuItem({ type: 'separator' }));

          const workspaces = ipcRenderer.sendSync('get-workspaces');

          const workspaceLst = Object.values(workspaces).sort((a, b) => a.order - b.order);

          menu.append(new MenuItem({
            label: 'Open Link in New Workspace',
            click: () => {
              ipcRenderer.send('request-open-url-in-workspace', info.linkURL);
            },
          }));
          menu.append(new MenuItem({ type: 'separator' }));

          workspaceLst.forEach((workspace) => {
            const workspaceName = workspace.name || `Workspace ${workspace.order + 1}`;
            menu.append(new MenuItem({
              label: `Open Link in ${workspaceName}`,
              click: () => {
                ipcRenderer.send('request-open-url-in-workspace', info.linkURL, workspace.id);
              },
            }));
          });
        }

        menu.append(new MenuItem({ type: 'separator' }));

        const contents = remote.getCurrentWebContents();
        menu.append(new MenuItem({
          label: 'Back',
          enabled: contents.canGoBack(),
          click: () => {
            contents.goBack();
          },
        }));
        menu.append(new MenuItem({
          label: 'Forward',
          enabled: contents.canGoForward(),
          click: () => {
            contents.goForward();
          },
        }));
        menu.append(new MenuItem({
          label: 'Reload',
          click: () => {
            contents.reload();
          },
        }));

        menu.append(new MenuItem({ type: 'separator' }));

        menu.append(
          new MenuItem({
            label: 'More',
            submenu: [
              {
                label: 'About',
                click: () => ipcRenderer.send('request-show-about-window'),
              },
              { type: 'separator' },
              {
                label: 'Check for Updates',
                click: () => ipcRenderer.send('request-check-for-updates'),
              },
              {
                label: 'Preferences...',
                click: () => ipcRenderer.send('request-show-preferences-window'),
              },
              { type: 'separator' },
              {
                label: 'WebCatalog Help',
                click: () => shell.openExternal('https://help.webcatalog.app?utm_source=juli_app'),
              },
              {
                label: 'WebCatalog Website',
                click: () => shell.openExternal('https://webcatalog.app?utm_source=juli_app'),
              },
              { type: 'separator' },
              {
                label: 'Quit',
                click: () => ipcRenderer.send('request-quit'),
              },
            ],
          }),
        );

        menu.popup(remote.getCurrentWindow());
      });
  });

  // Link preview
  const linkPreview = document.createElement('div');
  linkPreview.style.cssText = 'max-width: 80vw;height: 22px;position: fixed;bottom: -1px;right: -1px;z-index: 1000000;background-color: rgb(245, 245, 245);border-radius: 2px;border: #9E9E9E  1px solid;font-size: 12.5px;color: rgb(0, 0, 0);padding: 0px 8px;line-height: 22px;font-family: -apple-system, system-ui, BlinkMacSystemFont, sans-serif;white-space: nowrap;text-overflow: ellipsis;overflow: hidden; pointer-events:none;';
  ipcRenderer.on('update-target-url', (e, url) => {
    if (url && document.body) {
      linkPreview.innerText = url;
      document.body.appendChild(linkPreview);
    } else if (document.body && document.body.contains(linkPreview)) {
      document.body.removeChild(linkPreview);
    }
  });

  // overwrite gmail email discard button
  if (window.location.href.startsWith('https://mail.google.com')) {
    const node = document.createElement('script');
    node.innerHTML = 'window.close = () => { window.location.href = \'https://mail.google.com\' }';
    document.body.appendChild(node);
  }

  // Fix WhatsApp requires Google Chrome 49+ bug
  // https://github.com/meetfranz/recipe-whatsapp/blob/master/webview.js
  if (window.location.hostname.includes('web.whatsapp.com')) {
    setTimeout(() => {
      const elem = document.querySelector('.landing-title.version-title');
      if (elem && elem.innerText.toLowerCase().includes('google chrome')) {
        window.location.reload();
      }
    }, 1000);

    window.addEventListener('beforeunload', async () => {
      try {
        const webContents = remote.getCurrentWebContents();
        const { session } = webContents;
        session.flushStorageData();
        session.clearStorageData({
          storages: ['appcache', 'serviceworkers', 'cachestorage', 'websql', 'indexdb'],
        });

        const registrations = await window.navigator.serviceWorker.getRegistrations();

        registrations.forEach((r) => {
          r.unregister();
          console.log('ServiceWorker unregistered'); // eslint-disable-line no-console
        });
      } catch (err) {
        console.err(err); // eslint-disable-line no-console
      }
    });
  }

  // tie Google account info with workspace
  if (window.location.hostname.includes('google.com')) {
    let success = false;
    const getAccountInfoAsync = () => Promise.resolve()
      .then(() => {
        if (success) return;
        // eslint-disable-next-line no-console
        console.log('Getting Google account info...');
        const pictureUrl = document.querySelector('img.gb_ib')
          .getAttribute('data-srcset')
          .split(',')
          .pop()
          .trim()
          .split(' ')[0];
        const name = document.querySelector('.gb_qb').innerText;
        const email = document.querySelector('.gb_rb').innerText;
        ipcRenderer.send('request-set-workspace-account-info', workspaceId, {
          pictureUrl,
          name,
          email,
        });
        // eslint-disable-next-line no-console
        console.log('Google account info retrieved.', {
          pictureUrl,
          name,
          email,
        });
        success = true;
      })
      // eslint-disable-next-line no-console
      .catch(console.log);
    // run once immediately
    getAccountInfoAsync();
    // run again after 30 seconds, 1 minute, every 5 minutes
    // as the script fails if the page is not fully loaded
    setTimeout(() => {
      getAccountInfoAsync();
    }, 30 * 1000);
    setTimeout(() => {
      getAccountInfoAsync();
    }, 60 * 1000);
    setInterval(() => {
      getAccountInfoAsync();
    }, 5 * 60 * 1000);
  }

  // eslint-disable-next-line no-console
  console.log('Preload script is loaded...');

  handled = true;
};

// try to load as soon as dom is loaded
document.addEventListener('DOMContentLoaded', () => handleLoaded('document.on("DOMContentLoaded")'));
// if user navigates between the same website
// DOMContentLoaded might not be triggered so double check with 'onload'
// https://github.com/webcatalog/webcatalog-app/issues/797
window.addEventListener('load', () => handleLoaded('window.on("onload")'));

// Communicate with the frame
// Have to use this weird trick because contextIsolation: true
ipcRenderer.on('should-pause-notifications-changed', (e, val) => {
  window.postMessage({ type: 'should-pause-notifications-changed', val });
});

ipcRenderer.on('display-media-id-received', (e, val) => {
  window.postMessage({ type: 'return-display-media-id', val });
});

window.addEventListener('message', (e) => {
  if (!e.data) return;

  if (e.data.type === 'get-display-media-id') {
    ipcRenderer.send('request-show-display-media-window');
  }

  // set workspace to active when its notification is clicked
  if (e.data.type === 'focus-workspace') {
    ipcRenderer.send('request-set-active-workspace', e.data.workspaceId);
  }
});

// Fix Can't show file list of Google Drive
// https://github.com/electron/electron/issues/16587
// Fix chrome.runtime.sendMessage is undefined for FastMail
// https://github.com/quanglam2807/singlebox/issues/21
const initialShouldPauseNotifications = ipcRenderer.sendSync('get-pause-notifications-info') != null;
webFrame.executeJavaScript(`
(function() {
  window.chrome = {
    runtime: {
      sendMessage: () => {},
      connect: () => {
        return {
          onMessage: {
            addListener: () => {},
            removeListener: () => {},
          },
          postMessage: () => {},
          disconnect: () => {},
        }
      }
    }
  }

  window.electronSafeIpc = {
    send: () => null,
    on: () => null,
  };
  window.desktop = undefined;

  // Customize Notification behavior
  // https://stackoverflow.com/questions/53390156/how-to-override-javascript-web-api-notification-object
  const oldNotification = window.Notification;
  let shouldPauseNotifications = ${initialShouldPauseNotifications};
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'should-pause-notifications-changed') return;
    shouldPauseNotifications = e.data.val;
  });
  window.Notification = function() {
    if (!shouldPauseNotifications) {
      const notif = new oldNotification(...arguments);
      notif.addEventListener('click', () => {
        window.postMessage({ type: 'focus-workspace', workspaceId: "${workspaceId}" });
      });
      return notif;
    }
    return null;
  }
  window.Notification.requestPermission = oldNotification.requestPermission;
  Object.defineProperty(Notification, 'permission', {
    get() {
      return oldNotification.permission;
    }
  });

  if (window.navigator.mediaDevices) {
    window.navigator.mediaDevices.getDisplayMedia = () => {
      return new Promise((resolve, reject) => {
        const listener = (e) => {
          if (!e.data || e.data.type !== 'return-display-media-id') return;
          if (e.data.val) { resolve(e.data.val); }
          else { reject(new Error('Rejected')); }
          window.removeEventListener('message', listener);
        };
        window.postMessage({ type: 'get-display-media-id' });
        window.addEventListener('message', listener);
      })
        .then((id) => {
          return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: id,
              }
            }
          });
        });
    };
  }
})();
`);

// enable pinch zooming (default behavior of Chromium)
// https://github.com/electron/electron/pull/12679
webFrame.setVisualZoomLevelLimits(1, 10);

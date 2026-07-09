let currentPrefs = {};
let init = false;

const DEFAULT_MIN_WIDTH = 100;
const DEFAULT_MIN_HEIGHT = 100;
const VIDEO_OVERLAY_SYNC_INTERVAL = 1000;
const VIDEO_OVERLAY_BUTTON_SIZE = 26;
const VIDEO_OVERLAY_BUTTON_OFFSET = 6;
const DEFAULT_CONTENT_PREFS = {
  minWidth: DEFAULT_MIN_WIDTH,
  minHeight: DEFAULT_MIN_HEIGHT,
  showVideoOverlay: true,
  enableFirstVideoHotkey: true,
  firstVideoHotkey: 'T',
  enableOverlayHotkey: true,
  overlayHotkey: 'O'
};

const shortcutFuncs = {
  toggleCaptions: function(v){
    const validTracks = [];
    for(let i = 0; i < v.textTracks.length; ++i){
      const tt = v.textTracks[i];
      if(tt.mode === 'showing'){
        tt.mode = 'disabled';
        if(v.textTracks.addEventListener){
          // If text track event listeners are supported
          // (they are on the most recent Chrome), add
          // a marker to remember the old track. Use a
          // listener to delete it if a different track
          // is selected.
          v.cbhtml5vsLastCaptionTrack = tt.label;
          function cleanup(e){
            for(let i = 0; i < v.textTracks.length; ++i){
              const ott = v.textTracks[i];
              if(ott.mode === 'showing'){
                delete v.cbhtml5vsLastCaptionTrack;
                v.textTracks.removeEventListener('change', cleanup);
                return;
              }
            }
          }
          v.textTracks.addEventListener('change', cleanup);
        }
        return;
      }else if(tt.mode !== 'hidden'){
        validTracks.push(tt);
      }
    }
    // If we got here, none of the tracks were selected.
    if(validTracks.length === 0){
      return true; // Do not prevent default if no UI activated
    }
    // Find the best one and select it.
    validTracks.sort(function(a, b){

      if(v.cbhtml5vsLastCaptionTrack){
        const lastLabel = v.cbhtml5vsLastCaptionTrack;

        if(a.label === lastLabel && b.label !== lastLabel){
          return -1;
        }else if(b.label === lastLabel && a.label !== lastLabel){
          return 1;
        }
      }

      const aLang = a.language.toLowerCase(),
            bLang = b.language.toLowerCase(),
            navLang = navigator.language.toLowerCase();

      if(aLang === navLang && bLang !== navLang){
        return -1;
      }else if(bLang === navLang && aLang !== navLang){
        return 1;
      }

      const aPre = aLang.split('-')[0],
            bPre = bLang.split('-')[0],
            navPre = navLang.split('-')[0];

      if(aPre === navPre && bPre !== navPre){
        return -1;
      }else if(bPre === navPre && aPre !== navPre){
        return 1;
      }

      return 0;
    })[0].mode = 'showing';
  },

  togglePlay: function(v){
    if(v.paused)
      v.play();
    else
      v.pause();
  },

  toStart: function(v){
    v.currentTime = 0;
  },

  toEnd: function(v){
    v.currentTime = v.duration;
  },

  skipLeft: function(v,key,shift,ctrl){
    if(shift)
      v.currentTime -= 10;
    else if(ctrl)
      v.currentTime -= 1;
    else
      v.currentTime -= 5;
  },

  skipRight: function(v,key,shift,ctrl){
    if(shift)
      v.currentTime += 10;
    else if(ctrl)
      v.currentTime += 1;
    else
      v.currentTime += 5;
  },

  increaseVol: function(v){
    if(v.volume <= 0.9) v.volume += 0.1;
    else v.volume = 1;
  },

  decreaseVol: function(v){
    if(v.volume >= 0.1) v.volume -= 0.1;
    else v.volume = 0;
  },

  toggleMute: function(v){
    v.muted = !v.muted;
  },

  toggleFS: function(v){
    v.requestFullscreen();
  },

  slow: function(v,key,shift){
    if(v.playbackRate >= 0.25) v.playbackRate -= 0.25;
    else v.playbackRate = 0.01;
  },

  fast: function(v,key,shift){
    v.playbackRate += 0.25;
  },

  normalSpeed: function(v,key,shift){
    v.playbackRate = v.defaultPlaybackRate;
  },

  toPercentage: function(v,key){
    v.currentTime = v.duration * (key - 48) / 10.0;
  },
};

const keyFuncs = {
  32 : shortcutFuncs.togglePlay,      // Space
  75 : shortcutFuncs.togglePlay,      // K
  35 : shortcutFuncs.toEnd,           // End
  48 : shortcutFuncs.toStart,         // 0
  36 : shortcutFuncs.toStart,         // Home
  37 : shortcutFuncs.skipLeft,        // Left arrow
  74 : shortcutFuncs.skipLeft,        // J
  39 : shortcutFuncs.skipRight,       // Right arrow
  76 : shortcutFuncs.skipRight,       // L
  38 : shortcutFuncs.increaseVol,     // Up arrow
  40 : shortcutFuncs.decreaseVol,     // Down arrow
  77 : shortcutFuncs.toggleMute,      // M
  70 : shortcutFuncs.toggleFS,        // F
  67 : shortcutFuncs.toggleCaptions,  // C
  188: shortcutFuncs.slow,            // Comma
  190: shortcutFuncs.fast,            // Period
  191: shortcutFuncs.normalSpeed,     // Forward slash
  49 : shortcutFuncs.toPercentage,    // 1
  50 : shortcutFuncs.toPercentage,    // 2
  51 : shortcutFuncs.toPercentage,    // 3
  52 : shortcutFuncs.toPercentage,    // 4
  53 : shortcutFuncs.toPercentage,    // 5
  54 : shortcutFuncs.toPercentage,    // 6
  55 : shortcutFuncs.toPercentage,    // 7
  56 : shortcutFuncs.toPercentage,    // 8
  57 : shortcutFuncs.toPercentage,    // 9
};

const srcProxy = {
  'bleacherreport.com': {
    play: (node) => {
      let elem = node.parentNode.parentNode.querySelector('.amp-interactive');
      elem.click();
    }
  }
}

const setMiniPlayer = (impl, disable) => {
  const settingsButton = document.querySelector('[data-a-target="player-settings-button"]');
  try {
    settingsButton.click();
    document.querySelector('[data-a-target="player-settings-menu-item-advanced"]').click();
    const menuItem = document.querySelector('[data-a-target="player-settings-submenu-advanced-toggle-mini"]');
    const input = menuItem.querySelector('input');
    if (disable) {
      if (input.checked) {
        impl.miniPlayer = true;
        input.click();
      }
    } else {
      if (!!impl.miniPlayer && !input.checked) {
        input.click();
      }
    }
  } catch (e) {
  } finally {
    settingsButton.click();
  }
}

function MVUniversal() {}
MVUniversal.prototype={
  topTags: [],
  mvClass: 'show',
  setCoreNode: function () {
  },
  restoreCoreNode: function () {
  },
  getMainNode: function (node) {
    return getVideoPlayerNode(node);
  },
  setControllers: function (show) {
    let node = this.selectedNode;
    let tagName = node.tagName.toLocaleLowerCase();
    if(tagName === 'video' || tagName === 'iframe') {
      let attribute = tagName === 'video' ? 'controls' : 'allowfullscreen';
      if(show) {
        this.original[attribute] = node.hasAttribute(attribute) ? node.getAttribute(attribute) : null;
        node.setAttribute(attribute, 'true');
      }
      let script = document.createElement('script');
      script.setAttribute('id','mvScript');
      script.textContent = '(function(){Object.defineProperty(document.querySelector("video[mvHashCode='+this.currentHashCode+']"), "'+attribute+'", {configurable: false});document.head.removeChild(document.getElementById("mvScript"));})()';
      document.head.appendChild(script);
      if(!show) {
        if(this.original[attribute] !== null)
          node.setAttribute(attribute, this.original[attribute]);
        else
          node.removeAttribute(attribute);
      }
    }
  },
  registerEvents: function(node) {
    if(!node.hasAttribute('mvEventReg')) {
      node.setAttribute('mvEventReg', 'true');
      node.addEventListener('play', event => {
        if (!node.src) {
          let proxy = srcProxy[window.location.host]
          if (proxy) {
            event.preventDefault();
            proxy.play(node);
          }
        }
      }, true);
    }
  }
}

function MVTwitch() {}
MVTwitch.prototype={
  topTags: ['body', 'html'],
  mvClass: 'show-t',
  setCoreNode: function () {
    let coreNode = document.querySelector('.player-controls');
    coreNode.parentNode.setAttribute('mvclass', 'core');
    coreNode.setAttribute('mvclass', 'core');
    setMiniPlayer(this, true);
  },
  restoreCoreNode: function () {
    setMiniPlayer(this, false);
  },
  getMainNode: function (node) {
    return document.querySelector('.video-player__container');
  },
  setControllers: function (show, node) {
  },
  registerEvents: function () {
  }
}

function MVETwitch() {}
MVETwitch.prototype={
  topTags: ['body', 'html'],
  mvClass: 'show-t',
  setCoreNode: function () {
    let controlsNode = document.querySelector('.pl-controls-bottom');
    controlsNode.setAttribute('mvclass', 'core');
    controlsNode.parentNode.setAttribute('mvclass', 'core');
    let hoverDisplay = document.querySelector('.hover-display');
    hoverDisplay.setAttribute('mvclass', 'core');
    let playerui = document.querySelector('.player-ui');
    if(playerui) {
      playerui.setAttribute('mvclass', 'core');
    }
  },
  restoreCoreNode: function () {
  },
  getMainNode: function (node) {
    return node;
  },
  setControllers: function (show, node) {
  },
  registerEvents: function () {
  }
}

function MVNetflix() {}
MVNetflix.prototype={
  topTags: ['body', 'html'],
  mvClass: 'show-t',
  setCoreNode: function () {
    document.querySelector('.controls').setAttribute('mvclass', 'core');
  },
  restoreCoreNode: function () {
  },
  getMainNode: function (node) {
    return node;
  },
  setControllers: function (show, node) {
  },
  registerEvents: function () {
  }
}

const HASHCODE_LENGTH = 32;
let mvImpl;
let idCount = 0;
let vnStyle = [
  'position:fixed !important;',
  'top:0 !important;',
  'left:0 !important;',
  'min-width:100vw !important;',
  'min-height:100vh !important;',
  'width:100vw !important;',
  'height:100vh !important;',
  'max-width:100vw !important;',
  'max-height:100vh !important;',
  'margin:0 !important;',
  'padding:0 !important;',
  'transform:none !important;',
  'visibility:visible !important;',
  'border-width:0 !important;',
  'cursor:default !important;',
  'object-fit:contain !important;',
  'z-index: 2147483645 !important;',
].join('');
let vnStyleList = [
  'position', 'top', 'left', 'min-width',
  'min-height', 'width', 'height',
  'max-width', 'max-height', 'margin',
  'padding', 'visibility', 'border-width',
  'cursor', 'object-fit', 'z-index'];
let selectedVideoStyle = [
  'width:100% !important;',
  'height:100% !important;',
  'max-width:100% !important;',
  'max-height:100% !important;',
  'object-fit:contain !important;',
  'background-color:black !important;',
  'z-index:auto !important;',
].join('');
let selectedVideoStyleList = [
  'width', 'height', 'max-width',
  'max-height', 'object-fit', 'background-color',
  'z-index'];

if(window.location.href.startsWith('https://www.twitch.tv/')) {
  mvImpl = new MVTwitch();
}
else if(window.location.href.startsWith('https://player.twitch.tv/')) {
  mvImpl = new MVETwitch();
}
else if(window.location.href.startsWith('https://www.netflix.com/')) {
  mvImpl = new MVNetflix();
}
else {
  mvImpl = new MVUniversal();
}
mvImpl.status = 'normal';
mvImpl.original = {};
mvImpl.updateTimer = null;
mvImpl.videoOverlayButtons = new Map();
mvImpl.videoOverlayStarted = false;
mvImpl.videoOverlayFrame = null;
mvImpl.videoOverlayTimer = null;
mvImpl.videoOverlayObserver = null;
mvImpl.pendingSurfaceClick = null;
mvImpl.hiddenOccluders = [];
mvImpl.firstVideoCache = null;
mvImpl.firstVideoCacheFallbackTimer = null;

function getHashCode(length) {
  let hashCode = '';
  let characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let max = characters.length;
  for(let i = 0; i < length; ++i) {
    let r = Math.floor((Math.random() * (i === 0 ? 52 : 62) )); //don't start with number
    //let r = Math.floor(Math.random() * max);
    let char = characters.charAt(r);
    hashCode += char;
  }
  return hashCode;
}
let selfId = getHashCode(HASHCODE_LENGTH);
window.selfId = selfId;

function isYoutubeEmbed () {
  return window.location.href.startsWith('https://www.youtube.com/embed/');
}
function isYoutubeWatch () {
  return window.location.href.startsWith('https://www.youtube.com/watch');
}

function addToMvCover (elemInfo) {
  // console.log('[addToMvCover] ' + JSON.stringify(elemInfo, null, 4));
  // console.log(new Date());
  let allBlock = [];

  if(mvImpl.status !== 'selectVideo')
    return;
  let cover = document.querySelector('.mvCover');
  let videoBlocks = document.querySelectorAll('.mvVideoBlock');
  //let videoBlocks = document.querySelectorAll('.mvVideoBlock');

  let bodyPosition = window.getComputedStyle(document.body,null).getPropertyValue('position');
  let found = false;
  for(let v of videoBlocks) {
    let h = v.getAttribute('mvMaskHash');
    if(h === elemInfo.hashCode) {
      //update
      v.style.left = elemInfo.left + 'px';
      v.style.top = elemInfo.top + 'px';
      v.style.width = elemInfo.width + 'px';
      v.style.height = elemInfo.height + 'px';
      v.style.display = elemInfo.visible ? 'block' : 'none';
      if(elemInfo.frameId !== undefined)
        v.setAttribute('mvFrameId', elemInfo.frameId);
      found = true;
      break;
    }
  }
  if(!found) {
    let videoBlock = document.createElement('DIV');
    videoBlock.classList.add('mvVideoBlock');
    if(elemInfo.source)
      videoBlock.classList.add('mvHighLevel');
    videoBlock.setAttribute('tn', elemInfo.tagName);
    videoBlock.style.left = elemInfo.left + 'px';
    videoBlock.style.top = elemInfo.top + 'px';
    videoBlock.style.width = elemInfo.width + 'px';
    videoBlock.style.height = elemInfo.height + 'px';
    videoBlock.setAttribute('mvMaskHash', elemInfo.hashCode);
    if(elemInfo.frameId !== undefined)
      videoBlock.setAttribute('mvFrameId', elemInfo.frameId);
    //videoBlock.textContent = elemInfo.hashCode;
    videoBlock.addEventListener('mousedown', event => {
      if(event.button === 0) {
        event.stopImmediatePropagation();
        event.preventDefault();
        let msg = {action: 'maximizeVideo', url: window.location.href, hashCode: elemInfo.hashCode};
        try{
          if(event.shiftKey && event.layerX < 10 && event.layerY < 10 ) msg.strict = true;
        } catch (ex){}
        chrome.runtime.sendMessage(msg);
      }
    },true);
    document.body.appendChild(videoBlock);
    videoBlock.style.position = bodyPosition==='fixed' ? 'fixed' : 'absolute';
    videoBlock.style.display = elemInfo.visible ? 'block' : 'none';
    allBlock.push(videoBlock);
  }

  for(let v of videoBlocks) {
    v.style.position = bodyPosition==='fixed' ? 'fixed' : 'absolute';
    allBlock.push(v);
  }

  if(mvImpl.toolbarAction === 1) {
    let selected = null;
    for(let v of allBlock) {
      if(!selected && v.style.display !== 'none') {
        selected = v;
        break;
      }
    }
    if(selected) {
      cacheFirstVideoBlock(selected);
      mvImpl.toolbarAction = 0;
      chrome.runtime.sendMessage({action: 'maximizeVideo', url: window.location.href, hashCode: selected.getAttribute('mvMaskHash')});
    }
  }
}

function cacheFirstVideoBlock(videoBlock) {
  let hashCode = videoBlock.getAttribute('mvMaskHash');
  if(!hashCode)
    return;
  mvImpl.firstVideoCache = {
    hashCode: hashCode,
    frameId: videoBlock.getAttribute('mvFrameId') || '',
    tagName: videoBlock.getAttribute('tn') || ''
  };
}

function clearFirstVideoCacheFallbackTimer() {
  if(mvImpl.firstVideoCacheFallbackTimer) {
    clearTimeout(mvImpl.firstVideoCacheFallbackTimer);
    mvImpl.firstVideoCacheFallbackTimer = null;
  }
}

function startVideoMaskSearch(message) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    mvImpl.startScanTime = new Date();
    let cover = document.createElement('DIV');
    cover.classList.add('mvCover');
    cover.setAttribute('mvMaskHash', message.hashCode);
    document.body.appendChild(cover);
    let msg = {action: 'scanVideo', hashCode: message.hashCode};
    // if(message.supportFlash !== undefined) msg.supportFlash = message.supportFlash;
    if(message.minWidth !== undefined) msg.minWidth = message.minWidth;
    if(message.minHeight !== undefined) msg.minHeight = message.minHeight;
    chrome.runtime.sendMessage(msg);
  }
}

function tryMaximizeCachedFirstVideo(message) {
  if(!mvImpl.firstVideoCache || !mvImpl.firstVideoCache.hashCode)
    return false;

  let cachedHashCode = mvImpl.firstVideoCache.hashCode;
  chrome.runtime.sendMessage({
    action: 'maximizeVideo',
    url: window.location.href,
    hashCode: cachedHashCode,
    cachedFirstVideo: true
  });

  clearFirstVideoCacheFallbackTimer();
  mvImpl.firstVideoCacheFallbackTimer = setTimeout(() => {
    mvImpl.firstVideoCacheFallbackTimer = null;
    if(mvImpl.status === 'normal') {
      mvImpl.firstVideoCache = null;
      startVideoMaskSearch(message);
    }
  }, 250);
  return true;
}

function lockMainNodeStyle(lock) {
  if(lock) {
    if(mvImpl.strict) {
      //no way to unlock.
      let script = document.createElement('script');
      script.setAttribute('id','mvLockScript');
      script.textContent = '(function(){Object.defineProperty(document.querySelector("[mvHashCode='+mvImpl.currentHashCode+']"), "style", {configurable: false});document.head.removeChild(document.getElementById("mvLockScript"));})()';
      document.head.appendChild(script);
    }
    else {
      let observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          let n = mutation.target;
          let currentStyle = n.getAttribute('style');
          if(currentStyle !== mvImpl.vnNewStyle) {
            n.setAttribute('style', mvImpl.vnNewStyle);
          }
        });
      });
      let config = { attributes: true, attributeFilter: ['style']};
      observer.observe(mvImpl.mainNode, config);
      mvImpl.mainNodeObserver = observer;
    }
  }
  else {
    if(mvImpl.mainNodeObserver) {
      mvImpl.mainNodeObserver.disconnect();
      mvImpl.mainNodeObserver = null;
    }
  }
}

function getMergedFixedStyle(originalStyle, fixedStyle, fixedStyleList) {
  let vnNewStyle = '';
  originalStyle = originalStyle.trim().replace(/\r\n/g, '\r').replace(/\n/g, '\r').replace(/\r/g, '');
  if (originalStyle === '') {
    vnNewStyle = fixedStyle;
  }
  else {
    let styles = originalStyle.split(';');
    let slist = [];
    for (let s of styles) {
      let t = /([a-zA-Z-]{2,})\s?:\s?(.+)/;
      if(t.test(s)) {
        let m = s.split(t);
        let key = m[1];
        let value = m[2];
        if (!fixedStyleList.includes(key)) {
          slist.push(key+':'+value);
        }
      }
    }
    if (slist.length === 0) {
      vnNewStyle = fixedStyle;
    }
    else {
      vnNewStyle = fixedStyle + slist.join(';')+';';
    }
  }
  return vnNewStyle;
}

function maximizeMainNode() {
  let originalStyle = mvImpl.originalStyle = (mvImpl.mainNode.getAttribute('style') || '');
  mvImpl.vnNewStyle = getMergedFixedStyle(originalStyle, vnStyle, [...vnStyleList]);
  mvImpl.mainNode.setAttribute('style', mvImpl.vnNewStyle);
  lockMainNodeStyle(true);
  maximizeSelectedVideoNode();
  hidePageOccluders();
}

function isPlayerControlNode(node) {
  let controlPattern = /(^|[\s_-])(control|controls|button|btn|seek|scrub|progress|slider|volume|mute|play|pause|time|bar|range|settings|menu|caption|fullscreen|speed|rate)([\s_-]|$)/i;

  if(!node || !node.tagName) {
    return false;
  }
  if(node.classList && node.classList.contains('mvVideoOverlayButton')) {
    return false;
  }

  let tagName = node.tagName.toLocaleLowerCase();
  let inputType = node.getAttribute ? (node.getAttribute('type') || '').toLocaleLowerCase() : '';
  if(tagName === 'input' && ['range', 'button'].includes(inputType)) {
    return true;
  }

  let role = node.getAttribute ? node.getAttribute('role') : '';
  if(role && role.toLocaleLowerCase() === 'slider') {
    return true;
  }

  let className = typeof node.className === 'string' ? node.className : '';
  let text = [
    node.id || '',
    className,
    node.getAttribute ? node.getAttribute('aria-label') || '' : '',
    node.getAttribute ? node.getAttribute('title') || '' : ''
  ].join(' ');
  return controlPattern.test(text);
}

function isMediaControlLikeNode(node) {
  let controlPattern = /(^|[\s_-])(seek|scrub|progress|slider|volume|mute|play|pause|fullscreen|speed|rate|caption|subtitle)([\s_-]|$)/i;

  if(!node || !node.tagName) {
    return false;
  }
  if(node.classList && node.classList.contains('mvVideoOverlayButton')) {
    return true;
  }

  let tagName = node.tagName.toLocaleLowerCase();
  let inputType = node.getAttribute ? (node.getAttribute('type') || '').toLocaleLowerCase() : '';
  if(tagName === 'input' && inputType === 'range') {
    return true;
  }

  let role = node.getAttribute ? node.getAttribute('role') : '';
  if(role && role.toLocaleLowerCase() === 'slider') {
    return true;
  }

  let className = typeof node.className === 'string' ? node.className : '';
  let text = [
    node.id || '',
    className,
    node.getAttribute ? node.getAttribute('aria-label') || '' : '',
    node.getAttribute ? node.getAttribute('title') || '' : ''
  ].join(' ');
  return controlPattern.test(text);
}

function containsMediaControlLikeNode(node) {
  if(isMediaControlLikeNode(node)) {
    return true;
  }

  let elements = node.querySelectorAll('*');
  for(let elem of elements) {
    if(isMediaControlLikeNode(elem)) {
      return true;
    }
  }

  return false;
}

function hasPlayerControls(node, video) {
  let elements = node.querySelectorAll('*');
  for(let elem of elements) {
    if(elem === video || video.contains(elem)) {
      continue;
    }
    if(isPlayerControlNode(elem)) {
      return true;
    }
  }

  return false;
}

function getVideoPlayerNode(node) {
  if(!node || node.tagName !== 'VIDEO') {
    return node;
  }

  let parent = node.parentElement;
  for(let depth = 0; parent && depth < 5; ++depth, parent = parent.parentElement) {
    let tagName = parent.tagName ? parent.tagName.toLocaleLowerCase() : '';
    if(tagName === 'body' || tagName === 'html') {
      break;
    }
    if(hasPlayerControls(parent, node)) {
      return parent;
    }
  }

  return node;
}

function isMaximizedNode(node) {
  return node === mvImpl.mainNode ||
    node === mvImpl.selectedNode ||
    (node.contains && (node.contains(mvImpl.mainNode) || node.contains(mvImpl.selectedNode))) ||
    (mvImpl.mainNode && mvImpl.mainNode.contains && mvImpl.mainNode.contains(node));
}

function shouldHidePageOccluder(node, playerRect) {
  if(!node || !node.tagName || isMaximizedNode(node)) {
    return false;
  }
  if(node.classList && (
    node.classList.contains('mvVideoOverlayButton') ||
    node.classList.contains('mvCover') ||
    node.classList.contains('mvVideoBlock')
  )) {
    return false;
  }
  if(containsMediaControlLikeNode(node)) {
    return false;
  }

  let style = window.getComputedStyle(node);
  let zIndex = parseInt(style.zIndex);
  let positionedAbovePage = ['fixed', 'sticky'].includes(style.position) ||
    (style.position === 'absolute' && Number.isFinite(zIndex) && zIndex >= 1000);
  if(!positionedAbovePage) {
    return false;
  }
  if(style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
    return false;
  }

  let rect = node.getBoundingClientRect();
  if(rect.width < 1 || rect.height < 1) {
    return false;
  }
  return intersectRect(playerRect, rect);
}

function hidePageOccluders() {
  restorePageOccluders();

  let playerRect = mvImpl.mainNode.getBoundingClientRect();
  let elements = document.querySelectorAll('body *');
  for(let node of elements) {
    if(!shouldHidePageOccluder(node, playerRect)) {
      continue;
    }

    mvImpl.hiddenOccluders.push({
      node: node,
      style: node.getAttribute('style')
    });
    let originalStyle = node.getAttribute('style') || '';
    node.setAttribute('style', originalStyle + ';visibility:hidden !important;pointer-events:none !important;');
  }
}

function restorePageOccluders() {
  if(!mvImpl.hiddenOccluders || !mvImpl.hiddenOccluders.length) {
    mvImpl.hiddenOccluders = [];
    return;
  }

  for(let item of mvImpl.hiddenOccluders) {
    if(!item.node || !item.node.isConnected) {
      continue;
    }
    if(item.style === null) {
      item.node.removeAttribute('style');
    }
    else {
      item.node.setAttribute('style', item.style);
    }
  }
  mvImpl.hiddenOccluders = [];
}

function maximizeSelectedVideoNode() {
  if(!mvImpl.selectedNode || mvImpl.selectedNode === mvImpl.mainNode || mvImpl.selectedNode.tagName !== 'VIDEO') {
    mvImpl.selectedVideoOriginalStyle = null;
    return;
  }

  mvImpl.selectedVideoOriginalStyle = mvImpl.selectedNode.getAttribute('style') || '';
  mvImpl.selectedVideoNewStyle = getMergedFixedStyle(
    mvImpl.selectedVideoOriginalStyle,
    selectedVideoStyle,
    [...selectedVideoStyleList]
  );
  mvImpl.selectedNode.setAttribute('style', mvImpl.selectedVideoNewStyle);
}

function shouldHandleVideoSurfaceClick(event) {
  return mvImpl.status === 'maximaVideo' &&
    mvImpl.selectedNode &&
    mvImpl.selectedNode.tagName === 'VIDEO' &&
    event.target === mvImpl.selectedNode &&
    (event.button === undefined || event.button === 0);
}

function storeVideoSurfaceClick(event) {
  if(!shouldHandleVideoSurfaceClick(event)) {
    mvImpl.pendingSurfaceClick = null;
    return;
  }

  mvImpl.pendingSurfaceClick = {
    currentTime: mvImpl.selectedNode.currentTime,
    muted: mvImpl.selectedNode.muted,
    node: mvImpl.selectedNode,
    paused: mvImpl.selectedNode.paused,
    playbackRate: mvImpl.selectedNode.playbackRate,
    volume: mvImpl.selectedNode.volume,
    x: event.clientX,
    y: event.clientY
  };
}

function handleVideoSurfaceClick(event) {
  let pendingClick = mvImpl.pendingSurfaceClick;
  mvImpl.pendingSurfaceClick = null;
  if(!pendingClick || !shouldHandleVideoSurfaceClick(event)) {
    return true;
  }
  if(Math.abs(event.clientX - pendingClick.x) > 6 || Math.abs(event.clientY - pendingClick.y) > 6) {
    return true;
  }

  setTimeout(() => {
    if(
      mvImpl.status !== 'maximaVideo' ||
      mvImpl.selectedNode !== pendingClick.node ||
      mvImpl.selectedNode.paused !== pendingClick.paused ||
      Math.abs(mvImpl.selectedNode.currentTime - pendingClick.currentTime) > 0.25 ||
      mvImpl.selectedNode.muted !== pendingClick.muted ||
      mvImpl.selectedNode.playbackRate !== pendingClick.playbackRate ||
      Math.abs(mvImpl.selectedNode.volume - pendingClick.volume) > 0.01
    ) {
      return;
    }

    shortcutFuncs.togglePlay(mvImpl.selectedNode);
  }, 0);
  return true;
}

function restoreVideo() {
  if (!mvImpl.selectedNode) return;
  restorePageOccluders();
  lockMainNodeStyle(false);
  mvImpl.mainNode.setAttribute('style', mvImpl.originalStyle);
  if(mvImpl.selectedVideoOriginalStyle !== null && mvImpl.selectedVideoOriginalStyle !== undefined) {
    mvImpl.selectedNode.setAttribute('style', mvImpl.selectedVideoOriginalStyle);
    mvImpl.selectedVideoOriginalStyle = null;
    mvImpl.selectedVideoNewStyle = null;
  }

  let mvClassList = [mvImpl.mvClass, 'core'];
  for(let cn of mvClassList) {
    let nodes = document.querySelectorAll('[mvclass='+cn+']');
    for(let node of nodes) {
      if(node.classList && node.classList.contains('mvVideoOverlayButton'))
        continue;
      node.removeAttribute('mvclass');
    }
  }

  if(mvImpl.scrollPosition) {
    window.scrollTo(mvImpl.scrollPosition.x, mvImpl.scrollPosition.y);
  }
};

function cancelMaximaMode() {
  if(mvImpl.status !== 'maximaVideo')
    return;
  mvImpl.status = 'normal';
  restoreVideo();
  scheduleVideoOverlayUpdate();
}

function maximizeVideo(selectedNode, chain = []) {
  mvImpl.scrollPosition = { x: window.scrollX, y: window.scrollY };

  mvImpl.selectedNode = selectedNode;
  mvImpl.mainNode = mvImpl.getMainNode(selectedNode);
  if(window !== window.top) { //this video is in iframe
    window.parent.postMessage({action: 'getId', senderId: selfId, nextAction: 'setVideoNode'},'*');
  }
  mvImpl.registerEvents(selectedNode);
  maximizeMainNode();
  scheduleVideoOverlayUpdate();
}

function getChildIFrameById(id) {
  let iframes = document.getElementsByTagName('IFRAME');
  for(let iframe of iframes) {
    if(iframe.getAttribute('mv_iframe') === id) {
      return iframe;
    }
  }
}

window.addEventListener('message', e => {
  if (e.data.action === 'getId') { //message from child
    let iframes = document.getElementsByTagName('IFRAME');
    for(let iframe of iframes) {
      let vmi = iframe.getAttribute('mv_iframe');
      if(!vmi) {
        iframe.setAttribute('mv_iframe', idCount);
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.contentWindow.postMessage({action: 'setId', reciver: e.data.senderId, id: iframe.getAttribute('mv_iframe'), nextAction: e.data.nextAction, extDate: e.data.extDate}, '*');
        idCount++;
      }
      else if(vmi) {
        iframe.contentWindow.postMessage({action: 'setId', reciver: e.data.senderId, id: iframe.getAttribute('mv_iframe'), nextAction: e.data.nextAction, extDate: e.data.extDate}, '*');
      }
    }
  }
  else if (e.data.action === 'setId') { //message from parent
    if(e.data.reciver !== selfId) {
      return;
    }
    if(e.data.nextAction === 'setVideoNode') {
      if(mvImpl.mainNode && window !== window.top) {
        window.parent.postMessage({action: 'setVideoNode', id: e.data.id},'*');
      }
    }
    else if(e.data.nextAction === 'addVideoElements') {
      window.parent.postMessage({action: 'addVideoElements', id: e.data.id, elemInfos: e.data.extDate},'*');
    }
  }
  else if(e.data.action === 'setVideoNode'){ //message from child
    clearFirstVideoCacheFallbackTimer();
    let iframe = getChildIFrameById(e.data.id);
    let hashCode = iframe.getAttribute('mvHashCode');
    if(!hashCode) {
      hashCode = getHashCode(HASHCODE_LENGTH);
      iframe.setAttribute('mvHashCode', hashCode);
    }
    mvImpl.currentHashCode = hashCode;
    mvImpl.status = 'maximaVideo';
    maximizeVideo(iframe);
    // if(window !== window.top) {
    //   window.parent.postMessage({action: 'getId', senderId: selfId, nextAction: 'setVideoNode'},'*');
    // }
  }
  else if(e.data.action === 'addVideoElements'){ //message from child
    let iframe = getChildIFrameById(e.data.id);
    let iframeRect = iframe.getBoundingClientRect();
    if(window !== window.top) {
      for(let elemInfo of e.data.elemInfos) {
        elemInfo.left += iframeRect.left + window.scrollX;
        elemInfo.top += iframeRect.top + window.scrollY;
      }
      window.parent.postMessage({action: 'getId', senderId: selfId, nextAction: 'addVideoElements', extDate: e.data.elemInfos},'*');
    }
    else {
      for(let elemInfo of e.data.elemInfos) {
        elemInfo.left += iframeRect.left + window.scrollX;
        elemInfo.top += iframeRect.top + window.scrollY;
        elemInfo.frameId = e.data.id;
        addToMvCover(elemInfo);
      }
    }
  }
  else if(e.data.action === 'cancelMaximaMode') {
    cancelMaximaMode();
    if(window !== window.top) {
      window.parent.postMessage({action: 'cancelMaximaMode'}, '*');
    }
  }
});

function isEditableHotkeyTarget(target) {
  if(!target)
    return false;
  if(target.isContentEditable)
    return true;

  let tagName = target.tagName ? target.tagName.toLocaleLowerCase() : '';
  return ['input', 'textarea', 'select', 'button'].includes(tagName);
}

function stopHotkeyEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  return false;
}

function toggleVideoOverlayPreference() {
  let showVideoOverlay = !shouldShowVideoOverlay();
  currentPrefs.showVideoOverlay = showVideoOverlay;
  chrome.storage.local.set({showVideoOverlay: showVideoOverlay});
  scheduleVideoOverlayUpdate();
}

function handleConfiguredHotkey(event) {
  if(event.altKey || event.metaKey || event.ctrlKey || isEditableHotkeyTarget(event.target)) {
    return true;
  }

  let key = normalizeHotkeyValue(event.key);
  let overlayHotkey = normalizeHotkeyValue(getPref('overlayHotkey'));
  if(getPref('enableOverlayHotkey') !== false && overlayHotkey && key === overlayHotkey) {
    toggleVideoOverlayPreference();
    return stopHotkeyEvent(event);
  }

  let firstVideoHotkey = normalizeHotkeyValue(getPref('firstVideoHotkey'));
  if(
    getPref('enableFirstVideoHotkey') !== false &&
    firstVideoHotkey &&
    key === firstVideoHotkey
  ) {
    if(mvImpl.status === 'maximaVideo') {
      requestCancelMaximaMode();
    }
    else if(mvImpl.status === 'normal') {
      chrome.runtime.sendMessage({action: 'maximizeFirstVideo'});
    }
    return stopHotkeyEvent(event);
  }

  return true;
}

window.addEventListener('mousedown', storeVideoSurfaceClick, true);
window.addEventListener('click', handleVideoSurfaceClick, true);

window.addEventListener('keydown', event => {
  if(event.key === 'Escape' && mvImpl.status === 'selectVideo') {
    chrome.runtime.sendMessage({action: 'cancelSelectMode'});
  }
  else if(handleConfiguredHotkey(event) === false) {
    return false;
  }
  else if (mvImpl.status === 'maximaVideo') {
    if (event.altKey || event.metaKey || event.ctrlKey) {
      return true;
    }
    const func = keyFuncs[event.keyCode];
    if(func){
      //send message to background script !
      //func(mvImpl.selectedNode, event.keyCode, event.shiftKey, event.ctrlKey);
      if(event.keyCode === 70) {// fullscreen
        mvImpl.mainNode.requestFullscreen();
      }
      else {
        let msg = {action: 'videoHotkey', keyCode: event.keyCode, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey};
        chrome.runtime.sendMessage(msg);
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
    return true;
  }
}, true);

const handleKeyEvent = (event) => {
  if (mvImpl.status === 'maximaVideo') {
    if(event.altKey || event.metaKey){
      return true;
    }
    const func = keyFuncs[event.keyCode];
    if(func){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return false;
    }
    return true;
  }
}
window.addEventListener('keypress', handleKeyEvent, true);
window.addEventListener('keyup', handleKeyEvent, true);
function inRect(point, rect) {
  return (point.x > rect.left && point.x < rect.right &&
  point.y > rect.top && point.y < rect.bottom);
}

function intersectRect(r1, r2) {
  return !(r2.left > r1.right ||
           r2.right < r1.left ||
           r2.top > r1.bottom ||
           r2.bottom < r1.top);
}

function isVisible(elem, elemRect) {
  const style = getComputedStyle(elem);
  if (style.display === 'none') return false;
  if (style.visibility !== 'visible') return false;
  if (style.opacity < 0.1) return false;
  let r = {left:0, top:0, right: window.innerWidth, bottom: window.innerHeight};
  if(intersectRect(r, elemRect)) {
    return true;
  }
  else {
    return false;
  }
}

function getElemInfo(elem) {
  let elemRect = elem.getBoundingClientRect();
  if(isYoutubeEmbed() && !elem.src) {
    let newElemRect = {
      bottom: elemRect.bottom,
      height: elemRect.height,
      left: elemRect.left,
      right: elemRect.right,
      top: elemRect.top,
      width: elemRect.width,
      x: elemRect.x,
      y: elemRect.y
    };
    elemRect = newElemRect;
    elemRect.y = elemRect.top = 0;
    elemRect.bottom = elemRect.height;
  }
  let hashCode = elem.getAttribute('mvHashCode');
  let foundSource = false;
  if(!hashCode) {
    hashCode = getHashCode(HASHCODE_LENGTH);
    elem.setAttribute('mvHashCode', hashCode);
  }

  if(elem.getAttribute('src')) {
    foundSource = true;
  }
  else {
    if(elem.querySelector('source[src]')) {
      foundSource = true;
    }
  }
  return {
    tagName: elem.tagName.toLocaleLowerCase(),
    left: elemRect.left + window.scrollX,
    top: elemRect.top + window.scrollY,
    width: elemRect.width,
    height: elemRect.height,
    hashCode: hashCode,
    source: foundSource,
    visible: isVisible(elem, elemRect),
    path: []
  };
}

function uploadElemInfo(elements, minWidth, minHeight, onlyUpdateNewElem) {
  let elemInfos = [];
  for(let elem of elements) {
    let mvHashCode = elem.getAttribute('mvHashCode');
    if(onlyUpdateNewElem && mvHashCode)
      continue;
    let elemInfo = getElemInfo(elem);
    if(elemInfo.width >= minWidth && elemInfo.height >= minHeight) {
      if(window === window.top) {
        addToMvCover(elemInfo);
      }
      else {
        elemInfos.push(elemInfo);
      }
    }
  }
  if(window !== window.top && elemInfos.length) {
    window.parent.postMessage({action: 'getId', senderId: selfId, nextAction: 'addVideoElements', extDate: elemInfos},'*');
  }
}

function removeVideoMask() {
  if(window === window.top) {
    let elem = document.querySelector('.mvCover');
    if(elem)
      elem.parentNode.removeChild(elem);
    let videoBlocks = document.querySelectorAll('.mvVideoBlock');
    for(let v of videoBlocks) {
      v.parentNode.removeChild(v);
    }
  }
}

function clearHideCursorTimer() {
  if(mvImpl.hideCursorTimer) {
    clearTimeout(mvImpl.hideCursorTimer);
    mvImpl.hideCursorTimer = null;
  }
}

function setHideCursorTimer() {
  clearHideCursorTimer();
  if(currentPrefs.autoHideCursor) {
    mvImpl.hideCursorTimer = setTimeout(()=>{
      mvImpl.vnNewStyle = mvImpl.vnNewStyle.replace('cursor:default','cursor:none');
      mvImpl.mainNode.setAttribute('style', mvImpl.vnNewStyle);

      mvImpl.mainNode.addEventListener('mousemove', e => {
        mvImpl.vnNewStyle = mvImpl.vnNewStyle.replace('cursor:none','cursor:default');
        mvImpl.mainNode.setAttribute('style', mvImpl.vnNewStyle);
        setHideCursorTimer();
      }, {capture: true, once: true}); // FF50+, Ch55+
    }, currentPrefs.delayForHideCursor*1000);
  }
}


function findVideoElements(selector) {
  const elements = []

  document.querySelectorAll(selector).forEach(element => {
    elements.push(element)
  })

  const shadowRoots = []
  const _findShadowRoots = (root) => {
    root.querySelectorAll('*').forEach(element => {
      // No shadow root? Continue.
      if (!element.shadowRoot) {
        return
      }
      shadowRoots.push(element)
      _findShadowRoots(element.shadowRoot)
    })
  }
  _findShadowRoots(document)
  if (shadowRoots.length) {
    for(const e of shadowRoots) {
      e.shadowRoot.querySelectorAll(selector).forEach(element => {
        elements.push(element)
      })
    }
  }
  return elements
}

function findVideoElement(selector) {
  const videoElem = document.querySelector(selector)
  if (videoElem) {
    return { elem: videoElem, chain: []}
  }

  const _findShadowRoots = (root, chain) => {
    let res = { elem: null, chain: chain}
    root.querySelectorAll('*').forEach(element => {
      // No shadow root? Continue.
      if (!element.shadowRoot) {
        return
      }
      const e = element.shadowRoot.querySelector(selector)
      if (e) {
        res = {elem: e, chain: [ ...chain, element ]}
      } else {
        const res2 = _findShadowRoots(element.shadowRoot, [ ...chain, element ])
        if (res2.elem) {
          res = res2
        }
      }
    })
    return res
  }
  const res = _findShadowRoots(document, [])
  return res
}

function getPref(name) {
  return currentPrefs[name] !== undefined ? currentPrefs[name] : DEFAULT_CONTENT_PREFS[name];
}

function normalizeHotkeyValue(value) {
  return (value || '').trim().charAt(0).toUpperCase();
}

function getMinVideoWidth() {
  let minWidth = parseInt(getPref('minWidth'));
  return Number.isFinite(minWidth) ? minWidth : DEFAULT_MIN_WIDTH;
}

function getMinVideoHeight() {
  let minHeight = parseInt(getPref('minHeight'));
  return Number.isFinite(minHeight) ? minHeight : DEFAULT_MIN_HEIGHT;
}

function shouldShowVideoOverlay() {
  return getPref('showVideoOverlay') !== false;
}

function getVisibleButtonPosition(rect, buttonSize, buttonOffset) {
  let maxLeft = Math.max(buttonOffset, window.innerWidth - buttonSize - buttonOffset);
  let maxTop = Math.max(buttonOffset, window.innerHeight - buttonSize - buttonOffset);
  return {
    left: Math.max(
      buttonOffset,
      Math.min(maxLeft, rect.right - buttonSize - buttonOffset)
    ),
    top: Math.max(
      buttonOffset,
      Math.min(maxTop, rect.top + buttonOffset)
    )
  };
}

function positionVideoOverlayButton(entry) {
  if(!entry || !entry.elem || !entry.elem.isConnected) {
    return false;
  }

  entry.button.setAttribute('mvclass', 'core');
  if(mvImpl.status === 'maximaVideo' && mvImpl.currentHashCode !== entry.hashCode) {
    entry.button.style.display = 'none';
    entry.button.classList.remove('mvVideoOverlayButtonActive');
    return true;
  }

  let rect = entry.elem.getBoundingClientRect();
  let visible = isVisible(entry.elem, rect);
  if(rect.width < getMinVideoWidth() || rect.height < getMinVideoHeight()) {
    visible = false;
  }

  if(!visible) {
    entry.button.style.display = 'none';
    return true;
  }

  const buttonSize = VIDEO_OVERLAY_BUTTON_SIZE;
  const buttonOffset = VIDEO_OVERLAY_BUTTON_OFFSET;
  const position = getVisibleButtonPosition(rect, buttonSize, buttonOffset);
  entry.button.style.left = position.left + 'px';
  entry.button.style.top = position.top + 'px';
  entry.button.style.display = 'block';
  entry.button.classList.toggle(
    'mvVideoOverlayButtonActive',
    mvImpl.status === 'maximaVideo' && mvImpl.currentHashCode === entry.hashCode
  );
  return true;
}

function removeVideoOverlayButton(hashCode) {
  let entry = mvImpl.videoOverlayButtons.get(hashCode);
  if(entry && entry.button && entry.button.parentNode) {
    entry.button.parentNode.removeChild(entry.button);
  }
  mvImpl.videoOverlayButtons.delete(hashCode);
}

function handleVideoOverlayClick(event, hashCode) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  event.currentTarget.setAttribute('mvclass', 'core');

  if(mvImpl.status === 'maximaVideo' && mvImpl.currentHashCode === hashCode) {
    requestCancelMaximaMode();
    return false;
  }

  chrome.runtime.sendMessage({
    action: 'maximizeVideo',
    url: window.location.href,
    hashCode: hashCode,
    directFrame: true
  });
  return false;
}

function requestCancelMaximaMode() {
  clearHideCursorTimer();
  cancelMaximaMode();
  if(window !== window.top) {
    window.parent.postMessage({action: 'cancelMaximaMode'}, '*');
  }
  chrome.runtime.sendMessage({
    action: 'cancelMaximaMode',
    url: window.location.href,
    directFrame: true
  });
}

function createVideoOverlayButton(hashCode) {
  let button = document.createElement('BUTTON');
  button.classList.add('mvVideoOverlayButton');
  button.setAttribute('type', 'button');
  button.setAttribute('mvclass', 'core');
  button.setAttribute('mvOverlayHash', hashCode);
  button.setAttribute('aria-label', chrome.i18n.getMessage('maximizeThisVideo') || 'Maximize this video');
  button.setAttribute('title', chrome.i18n.getMessage('maximizeThisVideo') || 'Maximize this video');

  const blockEvent = event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  button.addEventListener('mousedown', event => {
    if(event.button === 0) {
      handleVideoOverlayClick(event, hashCode);
    }
    else {
      blockEvent(event);
    }
  }, true);
  button.addEventListener('mouseup', blockEvent, true);
  button.addEventListener('click', blockEvent, true);

  document.body.appendChild(button);
  return button;
}

function syncVideoOverlayButtons() {
  if(!document.body) {
    scheduleVideoOverlayUpdate();
    return;
  }

  if(!shouldShowVideoOverlay()) {
    for(let entry of mvImpl.videoOverlayButtons.values()) {
      entry.button.style.display = 'none';
      entry.button.classList.remove('mvVideoOverlayButtonActive');
    }
    return;
  }

  let activeHashCodes = new Set();
  let elements = findVideoElements('video');
  for(let elem of elements) {
    let elemInfo = getElemInfo(elem);
    let hashCode = elemInfo.hashCode;
    if(elemInfo.width < getMinVideoWidth() || elemInfo.height < getMinVideoHeight()) {
      continue;
    }

    activeHashCodes.add(hashCode);
    let entry = mvImpl.videoOverlayButtons.get(hashCode);
    if(!entry) {
      entry = {
        elem: elem,
        hashCode: hashCode,
        button: createVideoOverlayButton(hashCode)
      };
      mvImpl.videoOverlayButtons.set(hashCode, entry);
    }
    else {
      entry.elem = elem;
    }
    positionVideoOverlayButton(entry);
  }

  for(let hashCode of mvImpl.videoOverlayButtons.keys()) {
    if(!activeHashCodes.has(hashCode)) {
      removeVideoOverlayButton(hashCode);
    }
  }
}

function scheduleVideoOverlayUpdate() {
  if(mvImpl.videoOverlayFrame !== null) {
    return;
  }

  mvImpl.videoOverlayFrame = window.requestAnimationFrame(() => {
    mvImpl.videoOverlayFrame = null;
    syncVideoOverlayButtons();
  });
}

function startVideoOverlayButtons() {
  if(mvImpl.videoOverlayStarted) {
    return;
  }
  mvImpl.videoOverlayStarted = true;

  initPrefs(scheduleVideoOverlayUpdate);
  window.addEventListener('resize', scheduleVideoOverlayUpdate, true);
  window.addEventListener('scroll', scheduleVideoOverlayUpdate, true);

  if(document.documentElement) {
    mvImpl.videoOverlayObserver = new MutationObserver(mutations => {
      for(let mutation of mutations) {
        if(!mutation.target.classList || !mutation.target.classList.contains('mvVideoOverlayButton')) {
          scheduleVideoOverlayUpdate();
          return;
        }
      }
    });
    mvImpl.videoOverlayObserver.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'hidden', 'src', 'style']
    });
  }

  mvImpl.videoOverlayTimer = window.setInterval(scheduleVideoOverlayUpdate, VIDEO_OVERLAY_SYNC_INTERVAL);
  scheduleVideoOverlayUpdate();
}

window.addEventListener('mvToolbarToggleMaximaMode', event => {
  if(mvImpl.status !== 'maximaVideo') {
    return;
  }

  event.preventDefault();
  requestCancelMaximaMode();
}, true);

chrome.runtime.onMessage.addListener( (message, sender, sendResponse) => {
  if(message.action === 'videoHotkey') {
    if(mvImpl.selectedNode && mvImpl.selectedNode.tagName === 'VIDEO') {
      const func = keyFuncs[message.keyCode];
      func(mvImpl.selectedNode, message.keyCode, message.shiftKey, message.ctrlKey);
    }
  }
  else if(message.action === 'maximizeVideo') {
    if(mvImpl.status === 'maximaVideo')
      return;
    removeVideoMask();
    let elements = document.querySelectorAll('video');
    for(let v of elements) {
      if(v.getAttribute('mvHashCode') !== message.hashCode)
        v.pause();
    }

    let { elem, chain } = findVideoElement('video[mvHashCode="'+message.hashCode+'"]')
    if(elem) {
      clearFirstVideoCacheFallbackTimer();
      mvImpl.status = 'maximaVideo';
      initPrefs( ()=>{
        setHideCursorTimer();
      });
      mvImpl.currentHashCode = message.hashCode;
      if(isYoutubeEmbed() && !elem.src) {
        elem.click();
        elem.addEventListener('progress', ()=>{
          elem.pause();
        },{capture: true, once: true});
      }
      mvImpl.strict = message.strict;
      maximizeVideo(elem, chain);
      if(mvImpl.selectedNode.tagName === 'VIDEO') {
        mvImpl.selectedNode.focus({preventScroll:true});
      }
      chrome.runtime.sendMessage({action: 'popupWindow'});
    }
  }
  else if(message.action === 'getReadyStatus') {
    if(window === window.top) {
      if (document.readyState === 'complete' || document.readyState === 'interactive'){
        sendResponse({readyStatus: true});
      }
      else {
        sendResponse({readyStatus: false});
      }
    }
  }
  else if(message.action === 'setVideoMask') {
    if(window === window.top) {
      if(mvImpl.status === 'normal') {
        mvImpl.toolbarAction = message.toolbarAction;
        // console.log('setVideoMask');
        // console.log(new Date());
        removeVideoMask();
        if(message.toolbarAction === 1 && tryMaximizeCachedFirstVideo(message))
          return;
        startVideoMaskSearch(message);
      }
      else if(mvImpl.status === 'selectVideo') {
        chrome.runtime.sendMessage({action: 'cancelSelectMode'});
      }
      else if(mvImpl.status === 'maximaVideo') {
        clearHideCursorTimer();
        chrome.runtime.sendMessage({action: 'cancelMaximaMode', url: window.location.href});
      }
    }
  }
  else if(message.action === 'scanVideo') {
    mvImpl.status = 'selectVideo';
    // console.log('scanVideo');
    const selector = 'video';
    let elements = findVideoElements(selector)
    const _uploadElemInfo = () => {
      mvImpl.scanVideoTimer = null;
      if(mvImpl.status === 'selectVideo'){
        uploadElemInfo(elements, message.minWidth, message.minHeight );
        elements = findVideoElements(selector);
        uploadElemInfo(elements, message.minWidth, message.minHeight, true);
        mvImpl.scanVideoTimer = setTimeout(_uploadElemInfo, 200);
      }
      if(window === window.top && mvImpl.toolbarAction === 1) {
        let diffTime = new Date() - mvImpl.startScanTime;
        if(diffTime > 3000) {
          mvImpl.toolbarAction = 0;
          chrome.runtime.sendMessage({action: 'cancelSelectMode'});
        }
      }
    }
    _uploadElemInfo();
  }
  else if(message.action === 'cancelSelectMode') {
    mvImpl.status = 'normal';
    removeVideoMask();
  }
  else if(message.action === 'cancelMaximaMode') {
    cancelMaximaMode();
  }
  return false;
});

if(window === window.top) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    chrome.runtime.sendMessage({action: 'tabReady'});
  }
  else {
    window.addEventListener('DOMContentLoaded', event => {
      chrome.runtime.sendMessage({action: 'tabReady'});
    }, true);
  }
}

function initPrefs(cb){
  if(!init) {
    init = true;
    chrome.storage.local.get(results => {
      if ((typeof results.length === 'number') && (results.length > 0)) {
        results = results[0];
      }
      currentPrefs = Object.assign({}, DEFAULT_CONTENT_PREFS, results);
      cb();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if(area === 'local') {
        let changedItems = Object.keys(changes);
        for (let item of changedItems) {
          currentPrefs[item] = changes[item].newValue;
          switch (item) {
            case 'minWidth':
            case 'minHeight':
            case 'showVideoOverlay':
              scheduleVideoOverlayUpdate();
              break;
            case 'autoHideCursor':
            case 'delayForHideCursor':
              if(mvImpl.status === 'maximaVideo') {
                setHideCursorTimer();
              }
              break;
          }
        }
      }
    });
  }
  else {
    cb();
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  startVideoOverlayButtons();
}
else {
  window.addEventListener('DOMContentLoaded', event => {
    startVideoOverlayButtons();
  }, true);
}

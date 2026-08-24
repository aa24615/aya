import { t } from 'common/util'

interface IIconTooltip {
  selector: string
  translationKey: string
  hoverTargetSelector?: string
}

const iconTooltips: IIconTooltip[] = [
  {
    selector: '.luna-modal-icon-close',
    translationKey: 'close',
  },
  {
    selector: '.luna-tab-icon-close',
    translationKey: 'closeTab',
    hoverTargetSelector: '.luna-tab-close',
  },
  {
    selector:
      '.luna-video-player-icon-play, .luna-music-player-icon-play',
    translationKey: 'play',
    hoverTargetSelector:
      '.luna-video-player-play, .luna-music-player-play',
  },
  {
    selector:
      '.luna-video-player-icon-pause, .luna-music-player-icon-pause',
    translationKey: 'pause',
    hoverTargetSelector:
      '.luna-video-player-play, .luna-music-player-play',
  },
  {
    selector:
      '.luna-video-player-icon-volume, .luna-video-player-icon-volume-down, .luna-video-player-icon-volume-off, .luna-music-player-icon-volume, .luna-music-player-icon-volume-down, .luna-music-player-icon-volume-off',
    translationKey: 'volume',
    hoverTargetSelector:
      '.luna-video-player-volume, .luna-music-player-volume',
  },
  {
    selector: '.luna-video-player-icon-camera',
    translationKey: 'screenshot',
  },
  {
    selector: '.luna-video-player-icon-pip',
    translationKey: 'pictureInPicture',
  },
  {
    selector:
      '.luna-video-player-icon-fullscreen, .luna-music-visualizer-icon-fullscreen',
    translationKey: 'fullscreen',
  },
  {
    selector:
      '.luna-music-player-icon-shuffle, .luna-music-player-icon-shuffle-disabled',
    translationKey: 'shufflePlayback',
  },
  {
    selector:
      '.luna-music-player-icon-loop-off, .luna-music-player-icon-loop-one, .luna-music-player-icon-loop-all',
    translationKey: 'loopMode',
  },
  {
    selector: '.luna-music-player-icon-file',
    translationKey: 'openFile',
  },
  {
    selector: '.luna-music-player-icon-music-list',
    translationKey: 'playlist',
  },
  {
    selector: '.luna-music-visualizer-icon-step-forward',
    translationKey: 'nextVisualization',
  },
  {
    selector: '.luna-text-viewer-icon-copy',
    translationKey: 'copy',
    hoverTargetSelector: '.luna-text-viewer-copy',
  },
  {
    selector: '.luna-text-viewer-icon-check',
    translationKey: 'copied',
    hoverTargetSelector: '.luna-text-viewer-copy',
  },
  {
    selector: '.luna-dom-viewer-icon-caret-right',
    translationKey: 'expandNode',
  },
  {
    selector: '.luna-dom-viewer-icon-caret-down',
    translationKey: 'collapseNode',
  },
]

const generatedIconSelector = iconTooltips
  .map(({ selector }) => selector)
  .join(', ')

export function initGeneratedIconTooltips() {
  function applyTooltip(element: Element) {
    for (const {
      selector,
      translationKey,
      hoverTargetSelector,
    } of iconTooltips) {
      if (!element.matches(selector)) {
        continue
      }
      const title = t(translationKey)
      const hoverTarget = hoverTargetSelector
        ? element.closest(hoverTargetSelector) || element
        : element
      hoverTarget.setAttribute('title', title)
      hoverTarget.setAttribute('aria-label', title)
      return
    }
  }

  function scan(node: Node) {
    if (!(node instanceof Element)) {
      return
    }
    if (node.matches(generatedIconSelector)) {
      applyTooltip(node)
    }
    node.querySelectorAll(generatedIconSelector).forEach(applyTooltip)
  }

  scan(document.body)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        scan(mutation.target)
        continue
      }
      mutation.addedNodes.forEach(scan)
    }
  })
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  })
}

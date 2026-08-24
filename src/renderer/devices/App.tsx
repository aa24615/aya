import { observer } from 'mobx-react-lite'
import DeviceManager from './components/DeviceManager'
import Screenshot from './components/Screenshot'
import Toolbar from './components/Toolbar'
import LunaSplitPane, { LunaSplitPaneItem } from 'luna-split-pane/react'
import Style from './App.module.scss'
import store from './store'

export default observer(function App() {
  return (
    <>
      <Toolbar />
      <div className={Style.splitPane}>
        <LunaSplitPane
          direction="horizontal"
          onResize={(weights) => {
            const [deviceManagerWeight, screenshotPaneWeight] = weights
            store.setScreenshotPaneWeight(
              (screenshotPaneWeight /
                (deviceManagerWeight + screenshotPaneWeight)) *
                100
            )
          }}
        >
          <LunaSplitPaneItem
            minSize={500}
            weight={100 - store.screenshotPaneWeight}
          >
            <DeviceManager />
          </LunaSplitPaneItem>
          <LunaSplitPaneItem
            minSize={300}
            weight={store.screenshotPaneWeight}
          >
            <Screenshot />
          </LunaSplitPaneItem>
        </LunaSplitPane>
      </div>
    </>
  )
})

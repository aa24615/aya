import Tabs from './Tabs'
import Settings from './Settings'
import Style from './Toolbar.module.scss'

export default function Toolbar() {
  return (
    <div className={Style.container}>
      <Tabs />
      <Settings />
    </div>
  )
}

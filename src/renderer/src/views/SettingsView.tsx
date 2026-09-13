import { useEffect, useState } from 'react'
import { listMidiInputs } from '../lib/midiInput'
import { useLibrary } from '../store'
import { KEYBOARD_PRESETS, type KeyCount } from '../types'

export function SettingsView() {
  const { stats, settings, updateSettings } = useLibrary()
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([])
  const [shortcutMsg, setShortcutMsg] = useState('')

  useEffect(() => {
    void listMidiInputs().then(setDevices)
  }, [])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Настройки</p>
          <h1>Подстройте пианино под себя</h1>
          <p className="lead">
            Клавиатура в приложении должна совпадать с вашей. Подписи и подсказки можно оставить включёнными, пока
            нотная грамота ещё складывается в одну картинку.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Сколько клавиш как у вас дома</h2>
        <p>76 — обычный диапазон цифрового пианино: от ми контроктавы до соль четвёртой.</p>
        <div className="chips">
          {([61, 76, 88] as KeyCount[]).map((count) => (
            <button
              key={count}
              type="button"
              className={settings.keyCount === count ? 'chip active' : 'chip'}
              onClick={() => void updateSettings({ keyCount })}
            >
              {KEYBOARD_PRESETS[count].label}
            </button>
          ))}
        </div>
        <p className="hint">{KEYBOARD_PRESETS[settings.keyCount].hint}</p>
      </section>

      <section className="panel">
        <h2>Подсказки для новичка</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.beginnerMode}
            onChange={(e) => void updateSettings({ beginnerMode: e.target.checked })}
          />
          Режим новичка: крупные ориентиры, до первой выделена, можно подглядывать на клавиши
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showNoteNames}
            onChange={(e) => void updateSettings({ showNoteNames: e.target.checked })}
          />
          Подпись «До» на начале каждой октавы
        </label>
      </section>

      <section className="panel">
        <h2>Как снова открыть программу</h2>
        <p>
          Ярлык и установщик лежат в папке программы. Если их нет — нажмите кнопку ниже.
        </p>
        <div className="btn-row" style={{ marginLeft: 0 }}>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              if (!window.notamentor?.createShortcuts) {
                setShortcutMsg('Откройте приложение через ярлык или установщик')
                return
              }
              const paths = await window.notamentor.createShortcuts()
              setShortcutMsg(`Готово: ${paths.desktop}`)
            }}
          >
            Создать ярлык в папке программы
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.notamentor) void window.notamentor.openInstallFolder()
            }}
          >
            Папка с программой
          </button>
        </div>
        {shortcutMsg ? <p className="hint">{shortcutMsg}</p> : null}
      </section>

      <section className="panel">
        <h2>MIDI-клавиатура</h2>
        {devices.length ? (
          <ul className="plain">
            {devices.map((d) => (
              <li key={d.id}>{d.name}</li>
            ))}
          </ul>
        ) : (
          <p>Пока ничего не найдено. Подключите инструмент и откройте этот экран снова.</p>
        )}
      </section>

      <section className="panel">
        <h2>Данные</h2>
        <p>
          Всего практики: {Math.round(stats.totalPracticeSeconds / 60)} мин · серия {stats.streakDays} дн. · разминок{' '}
          {stats.warmupSessions}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (window.notamentor) void window.notamentor.openUserData()
          }}
        >
          Открыть папку данных
        </button>
      </section>
    </div>
  )
}

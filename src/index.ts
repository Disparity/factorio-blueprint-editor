import * as PIXI from 'pixi.js'

import FileSaver from 'file-saver'
import { Book } from './factorio-data/book'
import bpString, { ModdedBlueprintError, TrainBlueprintError } from './factorio-data/bpString'

import G from './common/globals'
import { InventoryContainer } from './UI/panels/inventory'
import { TilePaintContainer } from './containers/paintTile'
import { BlueprintContainer, EditorMode } from './containers/blueprint'
import { DebugContainer } from './UI/panels/debug'
import { QuickbarContainer } from './UI/panels/quickbar'
import { InfoEntityPanel } from './UI/panels/infoEntityPanel'
import Blueprint from './factorio-data/blueprint'
import initDoorbell from './doorbell'
import actions from './actions'
import initDatGui from './datgui'
import initToasts from './toasts'
import spritesheetsLoader from './spritesheetsLoader'
import * as Editors from './UI/editors/factory'
import Entity from './factorio-data/entity'
import Dialog from './UI/controls/dialog'
import { EntityContainer } from './containers/entity'
import U from './common/util'

if (PIXI.utils.isMobile.any) {
    document.getElementById('loadingScreen').classList.add('mobileError')
    throw new Error('MOBILE DEVICE DETECTED')
}

console.log(
    '\n%cLooking for the source?\nhttps://github.com/Teoxoy/factorio-blueprint-editor\n',
    'color: #1f79aa; font-weight: bold'
)

const params = window.location.search.slice(1).split('&')

let bpSource: string
let bpIndex = 0
for (const p of params) {
    if (p.includes('source')) {
        bpSource = p.split('=')[1]
    }
    if (p.includes('index')) {
        bpIndex = Number(p.split('=')[1])
    }
}

const { guiBPIndex } = initDatGui()
initDoorbell()

const createToast = initToasts()
function createErrorMessage(text: string, error: unknown): void {
    console.error(error)
    createToast({
        text:
            `${text}<br>` +
            'Please check out the console (F12) for an error message and ' +
            'report this bug on github or using the feedback button.',
        type: 'error',
        timeout: 10000
    })
}
function createBPImportError(error: Error | ModdedBlueprintError): void {
    if (error instanceof TrainBlueprintError) {
        createErrorMessage(
            'Blueprint with train entities not supported yet. If you think this is a mistake:',
            error.errors
        )
        return
    }

    if (error instanceof ModdedBlueprintError) {
        createErrorMessage(
            'Blueprint with modded items not supported yet. If you think this is a mistake:',
            error.errors
        )
        return
    }

    createErrorMessage('Blueprint string could not be loaded.', error)
}
function createWelcomeMessage(): void {
    const notFirstRun = localStorage.getItem('firstRun') === 'false'
    if (notFirstRun) {
        return
    }
    localStorage.setItem('firstRun', 'false')

    // Wait a bit just to capture the users attention
    // This way they will see the toast animation
    setTimeout(() => {
        createToast({
            text:
                '> To access the inventory and start building press E<br>' +
                '> To import/export a blueprint string use ctrl/cmd + C/V<br>' +
                '> For more info press I<br>' +
                '> Also check out the settings area',
            timeout: 30000
        })
    }, 1000)
}

PIXI.settings.MIPMAP_TEXTURES = PIXI.MIPMAP_MODES.ON
PIXI.settings.ROUND_PIXELS = true
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR
PIXI.settings.WRAP_MODE = PIXI.WRAP_MODES.REPEAT
PIXI.settings.RENDER_OPTIONS.antialias = true // for wires
PIXI.settings.RENDER_OPTIONS.resolution = window.devicePixelRatio
PIXI.settings.RENDER_OPTIONS.autoDensity = true
PIXI.GRAPHICS_CURVES.adaptive = true
PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false
PIXI.settings.ANISOTROPIC_LEVEL = 16
// PIXI.settings.PREFER_ENV = 1
// PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.HIGH
// PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH

G.app = new PIXI.Application({ view: document.getElementById('editor') as HTMLCanvasElement })

// https://github.com/pixijs/pixi.js/issues/3928
// G.app.renderer.plugins.interaction.moveWhenInside = true
// G.app.renderer.plugins.interaction.interactionFrequency = 1

G.app.renderer.resize(window.innerWidth, window.innerHeight)
window.addEventListener(
    'resize',
    () => {
        G.app.renderer.resize(window.innerWidth, window.innerHeight)
    },
    false
)

G.BPC = new BlueprintContainer()
G.app.stage.addChild(G.BPC)

G.debugContainer = new DebugContainer()
if (G.debug) {
    G.app.stage.addChild(G.debugContainer)
}

G.quickbarContainer = new QuickbarContainer(G.quickbarRows)
G.app.stage.addChild(G.quickbarContainer)

G.infoEntityPanel = new InfoEntityPanel()
G.app.stage.addChild(G.infoEntityPanel)

G.dialogsContainer = new PIXI.Container()
G.app.stage.addChild(G.dialogsContainer)

G.paintIconContainer = new PIXI.Container()
G.app.stage.addChild(G.paintIconContainer)

Promise.all([
    // Get bp from source
    // catch the error here so that Promise.all can resolve
    bpString.getBlueprintOrBookFromSource(bpSource).catch(error => {
        createBPImportError(error)
        return new Blueprint()
    }),
    // Wait for fonts to get loaded
    document.fonts.ready,
    // Load spritesheets
    ...spritesheetsLoader.getAllPromises()
])
    .then(data => {
        // Load quickbarItemNames from localStorage
        if (localStorage.getItem('quickbarItemNames')) {
            const quickbarItemNames = JSON.parse(localStorage.getItem('quickbarItemNames'))
            G.quickbarContainer.generateSlots(quickbarItemNames)
        }

        loadBp(data[0], false)

        createWelcomeMessage()
    })
    .catch(error => createErrorMessage('Something went wrong.', error))

function loadBp(bpOrBook: Blueprint | Book, clearData = true): void {
    if (bpOrBook instanceof Book) {
        G.book = bpOrBook
        G.bp = G.book.getBlueprint(bpIndex ? bpIndex : undefined)

        guiBPIndex.max(G.book.lastBookIndex).setValue(G.book.activeIndex)
    } else {
        G.book = undefined
        G.bp = bpOrBook

        guiBPIndex.setValue(0).max(0)
    }

    if (clearData) {
        G.BPC.clearData()
    }
    G.BPC.initBP()
    G.loadingScreen.hide()

    if (!(bpOrBook instanceof Blueprint && bpOrBook.isEmpty())) {
        createToast({ text: 'Blueprint string loaded successfully', type: 'success' })
    }

    Dialog.closeAll()
}

// If the tab is not active then stop the app
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        G.app.start()
    } else {
        G.app.stop()
    }
})

window.addEventListener('unload', () => {
    G.app.stop()
    G.app.renderer.textureGC.unload(G.app.stage)
    G.app.destroy()
})

// ACTIONS //

actions.importKeybinds(JSON.parse(localStorage.getItem('keybinds')))

window.addEventListener('unload', () => {
    const keybinds = actions.exportKeybinds()
    if (Object.keys(keybinds).length) {
        localStorage.setItem('keybinds', JSON.stringify(keybinds))
    } else {
        localStorage.removeItem('keybinds')
    }
})

actions.copyBPString.bind({
    press: e => {
        if (G.bp.isEmpty()) {
            return
        }

        const onSuccess = (): void => {
            createToast({ text: 'Blueprint string copied to clipboard', type: 'success' })
        }

        const onError = (error: Error): void => {
            createErrorMessage('Blueprint string could not be generated.', error)
        }

        const bpOrBook = G.book ? G.book : G.bp
        if (navigator.clipboard && navigator.clipboard.writeText) {
            bpString
                .encode(bpOrBook)
                .then(s => navigator.clipboard.writeText(s))
                .then(onSuccess)
                .catch(onError)
        } else {
            const data = bpString.encodeSync(bpOrBook)
            if (data.value) {
                e.clipboardData.setData('text/plain', data.value)
                onSuccess()
            } else {
                onError(data.error)
            }
        }
    }
})

actions.pasteBPString.bind({
    press: e => {
        G.loadingScreen.show()

        const promise =
            navigator.clipboard && navigator.clipboard.readText
                ? navigator.clipboard.readText()
                : Promise.resolve(e.clipboardData.getData('text'))

        promise
            .then(bpString.getBlueprintOrBookFromSource)
            .then(loadBp)
            .catch(error => {
                G.loadingScreen.hide()
                createBPImportError(error)
            })
    }
})

actions.clear.bind({
    press: () => {
        loadBp(new Blueprint())
    }
})

actions.takePicture.bind({
    press: () => {
        if (G.bp.isEmpty()) {
            return
        }

        // getLocalBounds is needed because it seems that it has sideeffects
        // without it generateTexture returns an empty texture
        G.BPC.getLocalBounds()
        const region = G.BPC.getBlueprintBounds()
        const texture = G.app.renderer.generateTexture(G.BPC, PIXI.SCALE_MODES.LINEAR, 1, region)
        const canvas = G.app.renderer.plugins.extract.canvas(texture)

        canvas.toBlob(blob => {
            FileSaver.saveAs(blob, `${G.bp.name}.png`)
            createToast({ text: 'Blueprint image successfully generated', type: 'success' })

            // Clear
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
        })
    }
})

actions.showInfo.bind({
    press: () => G.BPC.overlayContainer.toggleEntityInfoVisibility()
})

actions.info.bind({
    press: () => {
        const infoPanel = document.getElementById('info-panel')
        if (infoPanel.classList.contains('active')) {
            infoPanel.classList.remove('active')
        } else {
            infoPanel.classList.add('active')
        }
    }
})

actions.closeWindow.bind({
    press: () => {
        Dialog.closeLast()
    }
})

actions.inventory.bind({
    press: () => {
        // If there is a dialog open, assume user wants to close it
        if (Dialog.anyOpen()) {
            Dialog.closeLast()
        } else {
            new InventoryContainer('Inventory', undefined, G.BPC.spawnPaintContainer.bind(G.BPC))
        }
    }
})

actions.focus.bind({ press: () => G.BPC.centerViewport() })

actions.rotate.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.BPC.hoverContainer.entity.rotate(false, true)
        } else if (G.BPC.mode === EditorMode.PAINT) {
            G.BPC.paintContainer.rotate()
        }
    }
})

actions.reverseRotate.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.BPC.hoverContainer.entity.rotate(true, true)
        } else if (G.BPC.mode === EditorMode.PAINT) {
            G.BPC.paintContainer.rotate(true)
        }
    }
})

actions.pipette.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            const entity = G.BPC.hoverContainer.entity
            const itemName = Entity.getItemName(entity.name)
            const direction = entity.directionType === 'output' ? (entity.direction + 4) % 8 : entity.direction
            G.BPC.spawnPaintContainer(itemName, direction)
        } else if (G.BPC.mode === EditorMode.PAINT) {
            G.BPC.paintContainer.destroy()
        }
        G.BPC.exitCopyMode(true)
        G.BPC.exitDeleteMode(true)
    }
})

actions.increaseTileBuildingArea.bind({
    press: () => {
        if (G.BPC.paintContainer instanceof TilePaintContainer) {
            G.BPC.paintContainer.increaseSize()
        }
    }
})

actions.decreaseTileBuildingArea.bind({
    press: () => {
        if (G.BPC.paintContainer instanceof TilePaintContainer) {
            G.BPC.paintContainer.decreaseSize()
        }
    }
})

actions.undo.bind({
    press: () => {
        G.bp.history.undo()
    },
    repeat: true
})

actions.redo.bind({
    press: () => {
        G.bp.history.redo()
    },
    repeat: true
})

actions.generateOilOutpost.bind({
    press: () => {
        const errorMessage = G.bp.generatePipes()
        if (errorMessage) {
            createToast({ text: errorMessage, type: 'warning' })
        }
    }
})

actions.copySelection.bind({
    press: () => G.BPC.enterCopyMode(),
    release: () => G.BPC.exitCopyMode()
})
actions.deleteSelection.bind({
    press: () => G.BPC.enterDeleteMode(),
    release: () => G.BPC.exitDeleteMode()
})

actions.pan.bind({
    press: () => G.BPC.enterPanMode(),
    release: () => G.BPC.exitPanMode()
})

actions.zoomIn.bind({
    press: () => {
        G.BPC.zoom(true)
    }
})

actions.zoomOut.bind({
    press: () => {
        G.BPC.zoom(false)
    }
})

actions.build.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.PAINT) {
            G.BPC.paintContainer.placeEntityContainer()
        }
    },
    repeat: true
})

actions.mine.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.bp.removeEntity(G.BPC.hoverContainer.entity)
        }
        if (G.BPC.mode === EditorMode.PAINT) {
            G.BPC.paintContainer.removeContainerUnder()
        }
    },
    repeat: true
})

actions.moveEntityUp.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.BPC.hoverContainer.entity.moveBy({ x: 0, y: -1 })
        }
    }
})
actions.moveEntityLeft.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.BPC.hoverContainer.entity.moveBy({ x: -1, y: 0 })
        }
    }
})
actions.moveEntityDown.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.BPC.hoverContainer.entity.moveBy({ x: 0, y: 1 })
        }
    }
})
actions.moveEntityRight.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            G.BPC.hoverContainer.entity.moveBy({ x: 1, y: 0 })
        }
    }
})

actions.openEntityGUI.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            if (G.debug) {
                console.log(G.BPC.hoverContainer.entity.serialize())
            }

            Dialog.closeAll()
            const editor = Editors.createEditor(G.BPC.hoverContainer.entity)
            if (editor === undefined) {
                return
            }
            editor.show()
        }
    }
})

let entityForCopyData: Entity | undefined
actions.copyEntitySettings.bind({
    press: () => {
        if (G.BPC.mode === EditorMode.EDIT) {
            // Store reference to source entity
            entityForCopyData = G.BPC.hoverContainer.entity
        }
    }
})
actions.pasteEntitySettings.bind({
    press: () => {
        if (entityForCopyData && G.BPC.mode === EditorMode.EDIT) {
            // Hand over reference of source entity to target entity for pasting data
            G.BPC.hoverContainer.entity.pasteSettings(entityForCopyData)
        }
    },
    repeat: true
})
// TODO: Move this somewhere else - I don't think this is the right place for it
{
    let copyCursorBox: PIXI.Container | undefined
    const deferred = new U.Deferred()
    const createCopyCursorBox = (): void => {
        if (
            copyCursorBox === undefined &&
            G.BPC.mode === EditorMode.EDIT &&
            entityForCopyData &&
            EntityContainer.mappings.has(entityForCopyData.entityNumber) &&
            G.BPC.hoverContainer.entity.canPasteSettings(entityForCopyData)
        ) {
            const srcEnt = EntityContainer.mappings.get(entityForCopyData.entityNumber)
            copyCursorBox = G.BPC.overlayContainer.createCursorBox(srcEnt.position, entityForCopyData.size, 'copy')
            Promise.race([
                deferred.promise,
                new Promise(resolve => actions.copyEntitySettings.bind({ press: resolve, once: true })),
                new Promise(resolve => G.BPC.once('removeHoverContainer', resolve))
            ]).then(() => {
                deferred.reset()
                copyCursorBox.destroy()
                copyCursorBox = undefined
            })
        }
    }
    actions.tryPasteEntitySettings.bind({ press: createCopyCursorBox, release: () => deferred.resolve() })
    G.BPC.on('createHoverContainer', () => {
        if (actions.tryPasteEntitySettings.pressed) {
            createCopyCursorBox()
        }
    })
}

actions.quickbar1.bind({ press: () => G.quickbarContainer.bindKeyToSlot(0) })
actions.quickbar2.bind({ press: () => G.quickbarContainer.bindKeyToSlot(1) })
actions.quickbar3.bind({ press: () => G.quickbarContainer.bindKeyToSlot(2) })
actions.quickbar4.bind({ press: () => G.quickbarContainer.bindKeyToSlot(3) })
actions.quickbar5.bind({ press: () => G.quickbarContainer.bindKeyToSlot(4) })
actions.quickbar6.bind({ press: () => G.quickbarContainer.bindKeyToSlot(5) })
actions.quickbar7.bind({ press: () => G.quickbarContainer.bindKeyToSlot(6) })
actions.quickbar8.bind({ press: () => G.quickbarContainer.bindKeyToSlot(7) })
actions.quickbar9.bind({ press: () => G.quickbarContainer.bindKeyToSlot(8) })
actions.quickbar10.bind({ press: () => G.quickbarContainer.bindKeyToSlot(9) })
actions.changeActiveQuickbar.bind({ press: () => G.quickbarContainer.changeActiveQuickbar() })

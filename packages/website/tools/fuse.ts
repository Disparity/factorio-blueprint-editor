import { join } from 'path'
import { fusebox, sparky } from 'fuse-box'
import { IDevServerProps } from 'fuse-box/devServer/devServerProps'
import { Context as FuseBoxContext } from 'fuse-box/core/context'
import { wrapContents } from 'fuse-box/plugins/pluginStrings'
import { minify as luamin } from 'luamin'
import { IPublicConfig } from 'fuse-box/config/IConfig'
import { IRunResponse } from 'fuse-box/core/IRunResponse'
import { IRunProps } from 'fuse-box/config/IRunProps'

const port = Number(process.env.PORT) || 8080

const p = (p: string): string => join(__dirname, p)

class Context {
    public readonly paths = {
        cache: p('.fusebox'),
        dist: p('../dist'),
    }
    public runDev(runProps?: IRunProps): Promise<IRunResponse> {
        return fusebox(this.getConfig(true)).runDev(runProps)
    }
    public runProd(runProps?: IRunProps): Promise<IRunResponse> {
        return fusebox(this.getConfig()).runProd(runProps)
    }
    private getConfig(runServer = false): IPublicConfig {
        return {
            compilerOptions: {
                tsConfig: p('../tsconfig.json'),
            },
            entry: p('../src/index.ts'),
            target: 'browser',
            webIndex: { template: p('../src/index.html') },
            devServer: runServer && this.getServerConfig(),
            plugins: [this.luaPlugin],
            cache: { root: this.paths.cache },
            hmr: { plugin: p('./hmr.ts') },
            // sourceMap: { sourceRoot: '' },
            watcher: {
                root: [
                    p('../src'),
                    p('../../editor/src'),
                    p('../../factorio-data/src'),
                    p('../../lua-runtime/dist'),
                ],
            },
        }
    }
    private getServerConfig(): IDevServerProps {
        return {
            httpServer: { port },
            hmrServer: { port },
            proxy: [
                {
                    path: '/api',
                    options: {
                        target: `http://localhost:8888`,
                        // pathRewrite: { '^/api': '' },
                    },
                },
            ],
        }
    }
    private readonly luaPlugin = (ctx: FuseBoxContext): void => {
        ctx.ict.on('bundle_resolve_module', props => {
            const m = props.module
            if (!m.captured && m.extension === '.lua') {
                m.captured = true
                m.read()
                m.contents = wrapContents(`\`${luamin(m.contents)}\``, true)
            }
            return props
        })
    }
}

const { exec, rm, src, task } = sparky(Context)

task('copy-wasm', async ctx => {
    rm(join(ctx.paths.dist, 'main.wasm'))
    // rm(join(ctx.paths.dist, 'main.wasm.map'))
    await src(join(p('../../lua-runtime/dist'), 'main.wasm')) // 'main.wasm?(.map)'
        .dest(ctx.paths.dist, 'dist')
        .exec()
})

task('dev', async ctx => {
    rm(ctx.paths.cache)
    await exec('copy-wasm')
    await ctx.runDev({
        bundles: {
            distRoot: ctx.paths.dist,
            app: 'app.js',
        },
    })
})

task('build', async ctx => {
    rm(ctx.paths.dist)
    await exec('copy-wasm')
    await ctx.runProd({
        bundles: {
            distRoot: ctx.paths.dist,
            app: 'app.js',
        },
    })
})

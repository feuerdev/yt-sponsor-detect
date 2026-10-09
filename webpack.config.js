import path from 'path'
import { fileURLToPath } from 'url'

import HtmlWebpackPlugin from 'html-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const config = {
    mode: 'development',
    devtool: 'source-map',
    experiments: {
        asyncWebAssembly: true
    },
    entry: {
        'viewer-background': './src/viewer-background.js',
        'viewer-popup': './src/viewer-popup.js',
        'viewer-content': './src/viewer-content.js',
        'viewer-page': './src/viewer-page.js',
        'viewer-offscreen': './src/viewer-offscreen.js',
    },
    output: {
        path: path.resolve(__dirname, `dist`),
        filename: '[name].js',
        clean: true
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/popup.html',
            filename: 'popup.html',
            inject: false
        }),
        new HtmlWebpackPlugin({template: './src/viewer-offscreen.html', filename: 'viewer-offscreen.html', inject: false}),
        new CopyPlugin({
            patterns: [
                {from: 'src/viewer.css', to: 'viewer.css'},
                {
                    from: 'model',
                    to: 'model'
                },
                {
                    from: `src/manifest.json`,
                    to: './manifest.json'
                },
                {
                    from: '*.wasm',
                    context: 'node_modules/@xenova/transformers/dist',
                    to: './ort'
                }
            ]
        })
    ]
}

export default config
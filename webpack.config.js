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
        background: './src/background.js',
        popup: './src/popup.js',
        content: './src/content.js',
    },
    output: {
        path: path.resolve(__dirname, `dist`),
        filename: '[name].js'
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/popup.html',
            filename: 'popup.html'
        }),
        new CopyPlugin({
            patterns: [
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
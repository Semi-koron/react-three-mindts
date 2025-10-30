## 概要　 description

mindar の imagetracking を気軽に ts で書くことができるコンポーネントライブラリになります。

## 使い方 Usage

基本的に react-three-fiber の記法と同じで、ARCanvas の中にオブジェクトの情報を記述することで AR 上にオブジェクトを設置することができます。
また imagetracking を行う画像を設定するには、mind-ar 公式サイトの[image-targets-compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile)を使用してください。
そちらで生成された.mind ファイルを public 配下に設定し、パスを ARCanvas の markerUrl 属性に設定することで利用できます。

```tsx
import { ARCanvas } from "react-three-mindts";
import "./App.css";

function App() {
  return (
    <>
      <main style={{ width: "100vw", height: "100vh" }}>
        <ARCanvas markerUrl="./kyutxr-card.mind">
          <ambientLight />
          <pointLight position={[10, 10, 10]} />
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </ARCanvas>
      </main>
    </>
  );
}

export default App;
```

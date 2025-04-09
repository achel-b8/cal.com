---
name: テンプレート編集サイドバーに閉じるボタンを追加
about: テンプレート編集サイドバーに閉じるボタンを追加する提案
title: テンプレート編集サイドバーに閉じるボタンを追加
labels: enhancement
assignees: ''
---

## 問題点

現在、テンプレート編集サイドバーには閉じるボタンがなく、ユーザーがサイドバーを簡単に閉じる方法がありません。これにより、ユーザーエクスペリエンスが低下し、操作性が悪くなっています。

## 提案する解決策

すべてのテンプレート編集サイドバーに閉じる（✘）ボタンを追加し、ユーザーが簡単にサイドバーを閉じられるようにします。

## 技術的な実装詳細

1. **閉じるボタンの実装**:
   - 既存の`videos-single-view.tsx`のサイドバー実装を参考にして、閉じるボタンを追加します。
   - サイドバーコンポーネントに`open`状態を管理するための状態変数を追加します。
   ```tsx
   const [open, setOpen] = useState(true);
   ```
   - 閉じるボタンをサイドバーの上部または右上に配置し、クリックすると`setOpen(false)`を呼び出すようにします。
   ```tsx
   <button
     aria-label="閉じる"
     className="absolute right-2 top-2 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
     onClick={() => setOpen(false)}>
     <Icon name="x" className="h-5 w-5" />
   </button>
   ```

2. **確認ダイアログの実装**:
   - 未保存の変更がある場合に確認ダイアログを表示するために、`ConfirmationDialogContent`コンポーネントを使用します。
   - サイドバーコンポーネントに`hasUnsavedChanges`状態を追加して、変更があるかどうかを追跡します。
   ```tsx
   const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
   const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
   ```
   - 閉じるボタンのクリックハンドラーを更新して、未保存の変更がある場合は確認ダイアログを表示し、そうでない場合はサイドバーを閉じます。
   ```tsx
   const handleClose = () => {
     if (hasUnsavedChanges) {
       setShowConfirmationDialog(true);
     } else {
       setOpen(false);
     }
   };
   ```
   - 確認ダイアログを実装します。
   ```tsx
   <Dialog open={showConfirmationDialog} onOpenChange={setShowConfirmationDialog}>
     <ConfirmationDialogContent
       variety="warning"
       title="未保存の変更があります"
       confirmBtnText="閉じる"
       cancelBtnText="キャンセル"
       onConfirm={() => {
         setOpen(false);
         setShowConfirmationDialog(false);
       }}>
       <p>未保存の変更があります。保存せずに閉じますか？</p>
     </ConfirmationDialogContent>
   </Dialog>
   ```

## UI/UXの考慮事項

1. **ボタンのスタイリング**:
   - 閉じるボタンは既存のUIデザインに合わせて、シンプルで直感的なデザインにします。
   - ボタンは常に表示され、ユーザーが簡単に見つけられる位置に配置します。
   - ホバー時の視覚的なフィードバックを提供して、クリック可能であることを示します。

2. **アクセシビリティ**:
   - 適切な`aria-label`属性を追加して、スクリーンリーダーのユーザーがボタンの目的を理解できるようにします。
   - キーボードでのナビゲーションとフォーカス管理を適切に行います。

3. **確認ダイアログ**:
   - 未保存の変更がある場合のみ確認ダイアログを表示します。
   - ダイアログは明確なメッセージと2つのアクション（閉じる/キャンセル）を提供します。
   - キーボードショートカット（Escキー）でダイアログをキャンセルできるようにします。

## 受け入れ基準

- [ ] すべてのテンプレート編集サイドバーに閉じる（✘）ボタンが追加されている
- [ ] ボタンは常に表示され、ユーザーが簡単に見つけられる
- [ ] ボタンのスタイリングは既存のUIデザインに合っている
- [ ] ボタンをクリックするとサイドバーが閉じる
- [ ] 未保存の変更がある場合、確認ダイアログが表示される
- [ ] 確認ダイアログで「閉じる」を選択すると、変更を破棄してサイドバーが閉じる
- [ ] 確認ダイアログで「キャンセル」を選択すると、ダイアログが閉じてサイドバーは開いたままになる
- [ ] すべての機能がモバイルデバイスでも正しく動作する
- [ ] アクセシビリティ要件を満たしている（適切なaria属性、キーボードナビゲーション）

## 関連コンポーネント

- `videos-single-view.tsx`の`VideoMeetingInfo`コンポーネントには、参考になる閉じるボタンの実装があります。
- `ConfirmationDialogContent`コンポーネントは確認ダイアログの実装に使用できます。

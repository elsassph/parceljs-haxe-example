import js.Browser.document;

class Foo {
    public function new() {
        trace('A new Foo');
        // js.Lib.debug();
        var root = document.getElementById('root');
        root.appendChild(document.createTextNode(' Haxe!'));
    }
}

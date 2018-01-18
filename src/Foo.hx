import js.Browser.document;

class Foo {
    public function new() {
        trace('A new Foo!!');
        document.body.appendChild(document.createTextNode(' Haxe'));
    }
}

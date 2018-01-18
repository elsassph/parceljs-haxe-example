import js.Browser.document;

class Main {

    static function main() {
        document.body.appendChild(document.createTextNode('Hello '));

        Parcel.load(Foo).then(function(_) {
            var f = new Foo();
        });
    }
}

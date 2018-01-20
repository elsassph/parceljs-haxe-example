import js.Browser.document;

class Main {

    static function main() {
        var root = document.getElementById('root');
        root.innerHTML = 'Hello ';

        trace('load foo...');
        Parcel.load(Foo).then(function(_) {
            trace('loaded');
            var f = new Foo();
        });
    }
}

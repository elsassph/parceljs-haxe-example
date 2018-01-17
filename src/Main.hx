class Main {

    static function main() {
        trace('Hello haxe');

        Parcel.load(Foo).then(function(_) {
            var f = new Foo();
        });
    }
}

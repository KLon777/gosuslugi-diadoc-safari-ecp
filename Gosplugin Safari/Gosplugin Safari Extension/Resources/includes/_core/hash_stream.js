console.debug("%ctrust.plugin.extension.hash_stream load", "font-weight: bold;");


class HashStream {
    
    #algorithm_;
    #hash_;

    constructor(algorithm = 'md5') {
        this.#algorithm_ = HashStream.algorithm(algorithm);
        this.#hash_ = this.#algorithm_.create();
    }

    result() {
        const hash = this.#hash_.clone();
        return hash.finalize().toString(CryptoJS.enc.Hex);
    }

    addData(data) {
        this.#hash_.update(data);
        return this.result();
    }

    static algorithm(name) {
        const algorithms = {
            'md5'   : CryptoJS.algo.MD5,
            'sha1'  : CryptoJS.algo.SHA1,
            'sha224': CryptoJS.algo.SHA224,
            'sha256': CryptoJS.algo.SHA256,
            'sha384': CryptoJS.algo.SHA384,
            'sha512': CryptoJS.algo.SHA512,
            'sha3'  : CryptoJS.algo.SHA3
        };

        const candidate = name.toLowerCase();
        const found = candidate in algorithms;

        return found ? algorithms[candidate] : algorithms['md5'];
    }
}
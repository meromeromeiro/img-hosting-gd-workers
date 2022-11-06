package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strings"
	"time"
)

func getKeys() (*rsa.PrivateKey, *rsa.PublicKey) {
	privateKeyPem, err := ioutil.ReadFile("privateKey.pem")
	if err != nil {
		panic(err)
	}
	block, _ := pem.Decode(privateKeyPem)
	privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		panic(err)
	}
	return privateKey.(*rsa.PrivateKey), &privateKey.(*rsa.PrivateKey).PublicKey
}

func generate_sign(msg string, rsaPrivateKey *rsa.PrivateKey) string {
	rng := rand.Reader

	message := []byte(msg)

	// Only small messages can be signed directly; thus the hash of a
	// message, rather than the message itself, is signed. This requires
	// that the hash function be collision resistant. SHA-256 is the
	// least-strong hash function that should be used for this at the time
	// of writing (2016).
	hashed := sha256.Sum256(message)

	signature, err := rsa.SignPKCS1v15(rng, rsaPrivateKey, crypto.SHA256, hashed[:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error from signing: %s\n", err)
		return ""
	}

	return base64.URLEncoding.EncodeToString(signature)
}

func generate_sign_string() string {

	rsaPrivateKey, _ := getKeys()
	// rsaPrivateKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	// fmt.Println(rsaPrivateKey)

	// crypto/rand.Reader is a good source of entropy for blinding the RSA
	// operation.

	// fmt.Println(getjson())

	uEnc := base64.URLEncoding.EncodeToString([]byte(getjson()))
	// uEnc := strings.TrimRight(base64.URLEncoding.EncodeToString([]byte(getjson())), "=")

	signature := strings.TrimRight(generate_sign(`eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.`+uEnc, rsaPrivateKey), "=")

	// fmt.Println(`eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.` + uEnc + `.` + signature)
	return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.` + uEnc + `.` + signature
}

func getjson() string {
	// return fmt.Sprintf(`{"iss":"lumino@blissful-potion-276207.iam.gserviceaccount.com","scope":"https://www.googleapis.com/auth/drive.file","aud":"https://www.googleapis.com/oauth2/v4/token","exp":%d,"iat":%d}.`, time.Now().Unix()+1799, time.Now().Unix()-1800)
	return fmt.Sprintf(`{"iss":"lumino@blissful-potion-276207.iam.gserviceaccount.com","scope":"https://www.googleapis.com/auth/drive.file","aud":"https://oauth2.googleapis.com/token","exp":%d,"iat":%d}`, time.Now().Unix()+1799, time.Now().Unix()-1800)
	// return `{"iss":"lumino@blissful-potion-276207.iam.gserviceaccount.com","scope":"https://www.googleapis.com/auth/drive.file","aud":"https://www.googleapis.com/oauth2/v4/token","exp":1667068958,"iat":1667067958}`
}

func sign(w http.ResponseWriter, r *http.Request) {
	s := generate_sign_string()
	w.Write([]byte(s))
}

use napi_derive::napi;

#[napi]
pub fn hello_world() -> String {
    "hello world".to_string()
}

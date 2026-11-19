# Runner image for the Eolent conformance suite.
#
#   docker build -f conformance/Dockerfile -t eolent-conformance .
#   docker run --rm \
#     -e EOLENT_BASE_URL=http://host.docker.internal:8080 \
#     -e EOLENT_TOKEN_TENANT_A=... -e EOLENT_TOKEN_TENANT_B=... \
#     -v "$PWD/my-fixtures.json:/fixtures.json:ro" -e EOLENT_FIXTURES=/fixtures.json \
#     eolent-conformance
FROM node:22-alpine
WORKDIR /conformance
COPY conformance/lib ./lib
COPY conformance/tests ./tests
COPY conformance/fixtures ./fixtures
COPY package.json ./package.json
USER node
CMD ["node", "--test", "tests/tenancy.test.mjs", "tests/problem-details.test.mjs"]

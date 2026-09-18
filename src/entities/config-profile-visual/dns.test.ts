import assert from 'node:assert/strict'
import test from 'node:test'

import {
    applyVisualPatch,
    cloneDnsValue,
    getDnsHosts,
    getDnsServers,
    parseConfigProfile,
    serializeDnsHostValue,
    serializeDnsServer
} from './index.ts'

const xrayFixture = {
    dns: {
        servers: [
            '1.1.1.1',
            {
                address: '8.8.8.8',
                domains: ['geosite:google'],
                expectIPs: ['geoip:us'],
                skipFallback: true,
                queryStrategy: 'UseIPv4',
                customExperimentalField: true
            }
        ],
        hosts: { 'example.com': '1.2.3.4', 'domain:example.org': ['5.6.7.8', '9.9.9.9'] },
        clientIp: '1.2.3.4',
        tag: 'dns-internal',
        queryStrategy: 'UseIP',
        customDnsOption: { foo: 'bar' }
    },
    customRoot: { keep: true }
}

test('parses Xray DNS string/object servers and hosts', () => {
    const document = parseConfigProfile(xrayFixture, 'xray')
    assert.equal(document.dnsDetails.servers.length, 2)
    assert.equal(document.dnsDetails.servers[0].kind, 'string')
    assert.equal(document.dnsDetails.servers[0].address, '1.1.1.1')
    assert.equal(document.dnsDetails.servers[1].kind, 'object')
    assert.deepEqual(document.dnsDetails.servers[1].domains, ['geosite:google'])
    assert.equal(document.dnsDetails.servers[1].skipFallback, true)
    assert.equal(document.dnsDetails.hosts[1].valueKind, 'array')
    assert.equal(document.dnsDetails.queryStrategy, 'UseIP')
    assert.ok(document.unknownFields.includes('dns.customDnsOption'))
    assert.ok(document.unknownFields.includes('dns.servers[1].customExperimentalField'))
})

test('parses sing-box DNS fields without inventing Xray fields', () => {
    const config = {
        dns: {
            servers: [{ tag: 'cloudflare', address: 'https://1.1.1.1/dns-query' }],
            rules: [{ domain_suffix: ['example.com'], server: 'cloudflare' }],
            final: 'cloudflare',
            strategy: 'ipv4_only'
        }
    }
    const document = parseConfigProfile(config, 'singbox')
    assert.equal(document.dnsDetails.servers[0].tag, 'cloudflare')
    assert.equal(document.dnsDetails.final, 'cloudflare')
    assert.equal(document.dnsDetails.strategy, 'ipv4_only')
    assert.equal(document.dnsDetails.rulesCount, 1)
    assert.equal(document.dnsDetails.servers[0].domains.length, 0)
})

test('targeted DNS edits preserve unknown server and root fields', () => {
    const next = applyVisualPatch(xrayFixture, {
        operations: [
            { op: 'set', path: ['dns', 'servers', 1, 'address'], value: '9.9.9.9' },
            { op: 'set', path: ['dns', 'queryStrategy'], value: 'UseIPv4' },
            { op: 'set', path: ['dns', 'clientIp'], value: '5.6.7.8' },
            { op: 'set', path: ['dns', 'tag'], value: 'dns-public' }
        ]
    })
    const dns = next.dns as typeof xrayFixture.dns
    assert.equal((dns.servers[1] as Record<string, unknown>).address, '9.9.9.9')
    assert.equal((dns.servers[1] as Record<string, unknown>).customExperimentalField, true)
    assert.deepEqual(dns.customDnsOption, { foo: 'bar' })
    assert.deepEqual(next.customRoot, { keep: true })
})

test('DNS server serialization preserves original string/object shape', () => {
    assert.equal(
        serializeDnsServer(
            '1.1.1.1',
            {
                address: '8.8.8.8',
                tag: '',
                domains: [],
                expectIPs: [],
                skipFallback: undefined,
                queryStrategy: ''
            },
            'xray'
        ),
        '8.8.8.8'
    )
    const object = serializeDnsServer(
        { address: '1.1.1.1', custom: { keep: true } },
        {
            address: '8.8.8.8',
            tag: '',
            domains: [],
            expectIPs: [],
            skipFallback: true,
            queryStrategy: 'UseIPv4'
        },
        'xray'
    ) as Record<string, unknown>
    assert.equal(object.address, '8.8.8.8')
    assert.equal(object.skipFallback, true)
    assert.equal(object.queryStrategy, 'UseIPv4')
    assert.deepEqual(object.custom, { keep: true })
})

test('hosts add/edit/delete keep string and array value types', () => {
    const added = applyVisualPatch(xrayFixture, {
        operations: [
            { op: 'set', path: ['dns', 'hosts', 'new.example'], value: '10.0.0.1' },
            {
                op: 'set',
                path: ['dns', 'hosts', 'domain:new.example'],
                value: ['10.0.0.2', '10.0.0.3']
            }
        ]
    })
    const hosts = getDnsHosts(added)
    assert.equal(hosts.length, 4)
    assert.equal(serializeDnsHostValue(['10.0.0.9'], '10.0.0.1'), '10.0.0.9')
    assert.deepEqual(serializeDnsHostValue(['10.0.0.9'], ['10.0.0.1']), ['10.0.0.9'])
    const deleted = applyVisualPatch(added, {
        operations: [{ op: 'remove', path: ['dns', 'hosts', 'new.example'] }]
    })
    assert.equal(
        getDnsHosts(deleted).some((host) => host.key === 'new.example'),
        false
    )
})

test('DNS server add, duplicate, delete and reorder operate on the servers array only', () => {
    const added = applyVisualPatch(xrayFixture, {
        operations: [
            {
                op: 'set',
                path: ['dns', 'servers'],
                value: [...getDnsServers(xrayFixture), '9.9.9.9']
            }
        ]
    })
    const duplicated = applyVisualPatch(added, {
        operations: [
            {
                op: 'set',
                path: ['dns', 'servers'],
                value: [
                    ...getDnsServers(added).slice(0, 2),
                    cloneDnsValue(getDnsServers(added)[1]),
                    ...getDnsServers(added).slice(2)
                ]
            }
        ]
    })
    const reordered = applyVisualPatch(duplicated, {
        operations: [
            { op: 'set', path: ['dns', 'servers'], value: [...getDnsServers(duplicated)].reverse() }
        ]
    })
    const deleted = applyVisualPatch(reordered, {
        operations: [
            { op: 'set', path: ['dns', 'servers'], value: getDnsServers(reordered).slice(1) }
        ]
    })
    assert.equal(getDnsServers(added).length, 3)
    assert.equal(getDnsServers(duplicated).length, 4)
    assert.equal(getDnsServers(deleted).length, 3)
    assert.deepEqual((deleted.dns as typeof xrayFixture.dns).customDnsOption, { foo: 'bar' })
})

test('no-op DNS round trip is lossless', () => {
    const next = applyVisualPatch(xrayFixture, { operations: [] })
    assert.deepEqual(next, xrayFixture)
})
